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
            lineRange: '#L{line}-L{lineEnd}',
        },
        'bitbucket.org': {
            url: 'https://{domain}/{user}/{repo}/src/{revision}/{path}',
            line: '#lines-{line}',
            lineRange: '#lines-{line}:{lineEnd}',
        },
        'gitlab.com': {
            url: 'https://{domain}/{user}/{repo}/blob/{revision}/{path}',
            line: '#L{line}',
            lineRange: '#L{line}-{lineEnd}',
        },
        '_bitbucket_selfhosted': {
            url: 'https://{domain}/projects/{user}/repos/{repo}/browse/{path}',
            urlCommit: 'https://{domain}/projects/{user}/repos/{repo}/browse/{path}?at={revision}',
            urlBranch: 'https://{domain}/projects/{user}/repos/{repo}/browse/{path}?at=refs/heads/{revision}',
            line: '#{line}',
            lineRange: '#{line}-{lineEnd}',
        },
    };

    repoConf = syncRepoConf(repoConf);

    let repoData = {};

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(onActiveTextEditorChange));
    onActiveTextEditorChange();

    async function onActiveTextEditorChange() {
        vscode.commands.executeCommand('setContext', 'inGitUrlRepo', false);
        vscode.commands.executeCommand('setContext', 'inGitUrlDefaultBranch', false);

        // On some startup occasions we don't have activeTextEditor available
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
            'user': remoteOriginParts.user.replace(/^~/, ''),
            'repo': remoteOriginParts.repo,
            'path': fileName.substring(localBase.length + 1).replace(/\\/g, '/'),

            'currentCommit': currentCommit,
            'currentBranch': currentBranch,
            'defaultBranch': defaultBranch,
        };
    }

    async function getRemoteOrigin(dirname) {
        try {
            const { stdout } = await exec('git config --list', { cwd: dirname });

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
        } catch(e) {
        }
    }

    async function getGitLocalBase(dirname) {
        try {
            const { stdout } = await exec('git rev-parse --show-toplevel', { cwd: dirname });

            return stdout.trim();
        } catch(e) {
        }
    }

    async function getGitCurrentBranch(dirname) {
        try {
            const { stdout } = await exec('git rev-parse --abbrev-ref HEAD', { cwd: dirname });

            return stdout.trim();
        } catch(e) {
        }
    }

    async function getGitDefaultBranch(dirname) {
        try {
            const { stdout } = await exec('git symbolic-ref refs/remotes/origin/HEAD', { cwd: dirname });

            return stdout.trim().replace(/^refs\/remotes\/origin\//, '');
        } catch(e) {
        }
    }

    async function getGitCurrentCommit(dirname, filename) {
        try {
            const { stdout } = await exec('git rev-list -1 HEAD ' + filename, { cwd: dirname });

            return stdout.trim();
        } catch(e) {
        }
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

    function syncRepoConf(conf) {
        const userconf = vscode.workspace.getConfiguration('giturl');

        return {...userconf.domains, ...conf};
    }

    function getUrlPattern(urlType, domainKey, lineStart, lineEnd) {
        let url = '';

        if (!(domainKey in repoConf)) {
            domainKey = '_bitbucket_selfhosted';
        }

        if (urlType === 'currentCommit' && 'urlCommit' in repoConf[domainKey]) {
            url = repoConf[domainKey].urlCommit;
        } else if (urlType === 'currentBranch' && 'urlBranch' in repoConf[domainKey]) {
            url = repoConf[domainKey].urlBranch;
        } else {
            url = repoConf[domainKey].url;
        }

        if (lineEnd != lineStart && 'lineRange' in repoConf[domainKey]) {
            url += repoConf[domainKey].lineRange;
        } else if ('line' in repoConf[domainKey]) {
            url += repoConf[domainKey].line;
        }

        return url;
    }

    function fillUrlPattern(url, data) {
        for (let key in data) {
            let searchPattern = '{' + key + '}';
            url = url.replace(searchPattern, data[key]);
        }

        return url;
    }

    function openGitUrl(urlType) {
        repoConf = syncRepoConf(repoConf);

        let selectedLines = getSelectedLines(vscode.window.activeTextEditor.selection);
        repoData.line = selectedLines.start;
        repoData.lineEnd = selectedLines.end;
        repoData.revision = repoData[urlType];

        let url = getUrlPattern(urlType, repoData.domain, repoData.line, repoData.lineEnd);
        url = fillUrlPattern(url, repoData);
        vscode.env.openExternal(vscode.Uri.parse(url));
    }

    context.subscriptions.push(vscode.commands.registerCommand('giturl.open-currentcommit', function () {
        openGitUrl('currentCommit');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('giturl.open-currentbranch', function () {
        if (repoData.currentBranch === repoData.defaultBranch) {
            openGitUrl('defaultBranch');
        } else {
            openGitUrl('currentBranch');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('giturl.open-defaultbranch', function () {
        openGitUrl('defaultBranch');
    }));
}

function deactivate() {}

module.exports = { activate, deactivate }
