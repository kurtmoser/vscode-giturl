const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const util = require('util');
    const exec = util.promisify(require('child_process').exec);
    const pathHandler = require('path');

    let repoConf = {
        'github.com': {
            url: 'https://{domain}/{user}/{repo}/blob/{revision}/{path}',
            line: '#L{line}',
            lineRange: '#L{line}-L{line_end}',
        },
        'bitbucket.org': {
            url: 'https://{domain}/{user}/{repo}/src/{revision}/{path}',
            line: '#lines-{line}',
            lineRange: '#lines-{line}:{line_end}',
        },
        'gitlab.com': {
            url: 'https://{domain}/{user}/{repo}/blob/{revision}/{path}',
            line: '#L{line}',
            lineRange: '#L{line}-{line_end}',
        },
        '_bitbucket_selfhosted': {
            url: 'https://{domain}/projects/{user}/repos/{repo}/browse/{path}',
            urlCommit: 'https://{domain}/projects/{user}/repos/{repo}/browse/{path}?at={revision}',
            urlBranch: 'https://{domain}/projects/{user}/repos/{repo}/browse/{path}?at=refs/heads/{revision}',
            line: '#{line}',
            lineRange: '#{line}-{line_end}',
        },
  };

    let repoData = {};

    readUserConfig();

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(onActiveTextEditorChange));
    onActiveTextEditorChange();

    async function onActiveTextEditorChange() {
        vscode.commands.executeCommand('setContext', 'inGitUrlRepo', false);
        vscode.commands.executeCommand('setContext', 'inGitUrlDefaultBranch', false);

        // On same startup situations we don't have activeTextEditor available
        if (!vscode.window.activeTextEditor) {
            return;
        }

        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = pathHandler.dirname(fileName);

        repoData = {};

        // Return early if unable to detect dir. This happens on new/unsaved
        // files, but also for example when activating 'Output' window.
        if (dirName === '.') {
            return;
        }

        let localBase = await getGitLocalBase(dirName);

        if (!localBase) {
            return;
        }

        vscode.commands.executeCommand('setContext', 'inGitUrlRepo', true);

        let remoteOrigin = await getRemoteOrigin(dirName);
        let remoteOriginParts = await parseRemoteOrigin(remoteOrigin);

        let currentCommit = await getGitCurrentCommit(dirName, fileName);
        let currentBranch = await getGitCurrentBranch(dirName);
        let defaultBranch = await getGitDefaultBranch(dirName);

        if (currentBranch === defaultBranch) {
            vscode.commands.executeCommand('setContext', 'inGitUrlDefaultBranch', true);
        }

        repoData = {
            'domain': remoteOriginParts.domain,
            'user': remoteOriginParts.user,
            'repo': remoteOriginParts.repo,
            'path': fileName.substring(localBase.length + 1),

            'currentCommit': currentCommit,
            'currentBranch': currentBranch,
            'defaultBranch': defaultBranch,
        };
    }

    async function getRemoteOrigin(dirname) {
        const { stdout, stderr } = await exec('git config --list', { cwd: dirname });

        let remoteOrigin = null;
        let lines = stdout.match(/[^\r\n]+/g);
        lines.forEach(line => {
            let res = line.match(/^remote\.origin\.url=(.+)$/);
            if (res) {
                remoteOrigin = res[1];

                return;
            }
        });

        return remoteOrigin;
    }

    async function getGitLocalBase(dirname) {
        const { stdout, stderr } = await exec('git rev-parse --show-toplevel', { cwd: dirname });

        let res = stdout.replace(/\r?\n|\r/g, '');

        return res;
    }

    async function getGitCurrentBranch(dirname) {
        const { stdout, stderr } = await exec('git rev-parse --abbrev-ref HEAD', { cwd: dirname });

        let res = stdout.replace(/\r?\n|\r/g, '');

        return res;
    }

    async function getGitDefaultBranch(dirname) {
        const { stdout, stderr } = await exec('git symbolic-ref refs/remotes/origin/HEAD', { cwd: dirname });

        let res = stdout.replace(/\r?\n|\r/g, '');
        res = res.replace(/^refs\/remotes\/origin\//, '');

        return res;
    }

    async function getGitCurrentCommit(dirname, filename) {
        const { stdout, stderr } = await exec('git rev-list -1 HEAD ' + filename, { cwd: dirname });

        let res = stdout.replace(/\r?\n|\r/g, '');

        return res;
    }

    function buildUrl(pattern, params) {
        // Replace all placeholders in url with passed param values
        for (let key in params) {
            let searchPattern = '{' + key + '}';
            pattern = pattern.replace(searchPattern, params[key]);
        }

        return pattern;
    }

    function parseRemoteOrigin(remoteOrigin) {
        let remoteOriginParts = remoteOrigin.match(/^[^:]+:\/\/([^\/]+)\/.*?([^\/]+)\/([^\/]+)\.git$/);

        if (!remoteOriginParts) {
            remoteOriginParts = remoteOrigin.match(/^[^@]+@([^:]+):.*?([^\/]+)\/([^\/]+)\.git$/);
        }

        if (remoteOriginParts) {
            return {
                domain: remoteOriginParts[1],
                user: remoteOriginParts[2],
                repo: remoteOriginParts[3],
            }
        }
    }

    function getSelectedLines(selection) {
        let lineStart = selection.start.line + 1;
        let lineEnd = selection.end.line + 1;
        if (lineEnd > lineStart && selection.end.character == 0) {
            lineEnd--;
        }

        return {
            start: lineStart,
            end: lineEnd,
        };
    }

    async function giturlOpenWrapper() {
        let selectedLines = getSelectedLines(vscode.window.activeTextEditor.selection);
        repoData.line = selectedLines.start;
        repoData.line_end = selectedLines.end;
        repoData.revision = repoData.defaultBranch;

        let conf = repoConf[repoData.domain] || repoConf._bitbucket_selfhosted;
        let url = conf.url;

        if (repoData.line_end != repoData.line && 'lineRange' in conf) {
            url += conf.lineRange;
        } else if ('line' in conf) {
            url += conf.line;
        }

        url = buildUrl(url, repoData);
        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    async function giturlOpenCurrentBranchWrapper() {
        let selectedLines = getSelectedLines(vscode.window.activeTextEditor.selection);
        repoData.line = selectedLines.start;
        repoData.line_end = selectedLines.end;
        repoData.revision = repoData.currentBranch;

        let conf = repoConf[repoData.domain] || repoConf._bitbucket_selfhosted;
        let url = conf.urlBranch || conf.url;

        if (repoData.line_end != repoData.line && 'lineRange' in conf) {
            url += conf.lineRange;
        } else if ('line' in conf) {
            url += conf.line;
        }

        url = buildUrl(url, repoData);
        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    async function giturlOpenCurrentCommitWrapper() {
        let selectedLines = getSelectedLines(vscode.window.activeTextEditor.selection);
        repoData.line = selectedLines.start;
        repoData.line_end = selectedLines.end;
        repoData.revision = repoData.currentCommit;

        let conf = repoConf[repoData.domain] || repoConf._bitbucket_selfhosted;
        let url = conf.urlCommit || conf.url;

        if (repoData.line_end != repoData.line && 'lineRange' in conf) {
            url += conf.lineRange;
        } else if ('line' in conf) {
            url += conf.line;
        }

        url = buildUrl(url, repoData);
        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    function readUserConfig() {
        const config = vscode.workspace.getConfiguration('giturl');

        repoConf = {...config.domains, ...repoConf};
    }

    let disposables = [];

    disposables.push(vscode.commands.registerCommand('giturl.open-defaultbranch', function () {
        readUserConfig();

        giturlOpenWrapper();
    }));

    disposables.push(vscode.commands.registerCommand('giturl.open-currentbranch', function () {
        readUserConfig();

        giturlOpenCurrentBranchWrapper();
    }));

    disposables.push(vscode.commands.registerCommand('giturl.open-currentcommit', function () {
        readUserConfig();

        giturlOpenCurrentCommitWrapper();
    }));

    context.subscriptions.push(disposables);
}
exports.activate = activate;

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
