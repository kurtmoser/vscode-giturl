const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const util = require('util');
    const exec = util.promisify(require('child_process').exec);
    const pathHandler = require('path');

    let repoConf = [
        {
            domain: 'github.com',
            url: 'https://{domain}/{user}/{repo}/blob/{revision}/{path}',
            line: '#L{line}',
            lineRange: '#L{line}-L{line_end}',
        },
        {
            domain: 'bitbucket.org',
            url: 'https://{domain}/{user}/{repo}/src/{revision}/{path}',
            line: '#lines-{line}',
            lineRange: '#lines-{line}:{line_end}',
        },
        {
            domain: 'gitlab.com',
            url: 'https://{domain}/{user}/{repo}/blob/{revision}/{path}',
            line: '#L{line}',
            lineRange: '#L{line}-{line_end}',
        },
        {
            domain: '_bitbucket_selfhosted',
            url: 'https://{domain}/projects/{user}/repos/{repo}/browse/{path}',
            urlCommit: 'https://{domain}/projects/{user}/repos/{repo}/browse/{path}?at={revision}',
            urlBranch: 'https://{domain}/projects/{user}/repos/{repo}/browse/{path}?at=refs/heads/{revision}',
            line: '#{line}',
            lineRange: '#{line}-{line_end}',
        },
    ];

    async function getGitConfig(dirname) {
        const { stdout, stderr } = await exec('git config --list', { cwd: dirname });

        let remoteRepoUrl = '';

        let lines = stdout.match(/[^\r\n]+/g);
        lines.forEach(line => {
            let res = line.match(/^remote\.origin\.url=(.+)$/);
            if (res) {
                remoteRepoUrl = res[1];
            }
        });

        return {
            remoteRepoUrl: remoteRepoUrl,
        };
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
        const { stdout, stderr } = await exec('git remote show origin | grep "HEAD branch" | sed "s/\\s*HEAD branch:\\s*//"', { cwd: dirname });

        let res = stdout.replace(/\r?\n|\r/g, '');

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

    async function getUrlParams() {
        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = pathHandler.dirname(fileName);

        let localBase = await getGitLocalBase(dirName);
        let {remoteRepoUrl} = await getGitConfig(dirName);
        let remoteOriginParts = parseRemoteOrigin(remoteRepoUrl);

        let lineStart = vscode.window.activeTextEditor.selection.start.line + 1;
        let lineEnd = vscode.window.activeTextEditor.selection.end.line + 1;
        if (lineEnd > lineStart && vscode.window.activeTextEditor.selection.end.character == 0) {
            lineEnd--;
        }

        let urlParams = {
            domain: remoteOriginParts.domain,
            user: remoteOriginParts.user,
            repo: remoteOriginParts.repo,
            path: fileName.substring(localBase.length + 1),
            line: lineStart,
            line_end: lineEnd,
        };

        return urlParams;
    }

    async function giturlOpenWrapper() {
        let urlParams = await getUrlParams();

        // Find conf according to the domain of repo
        let conf = repoConf.find((item) => {
            return item.domain == urlParams.domain;
        });

        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = pathHandler.dirname(fileName);
        let branchName = await getGitDefaultBranch(dirName);
        urlParams.revision = branchName;

        let url = conf.url;

        if (urlParams.line_end != urlParams.line && 'lineRange' in conf) {
            url += conf.lineRange;
        } else if ('line' in conf) {
            url += conf.line;
        }

        url = buildUrl(url, urlParams);
        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    async function giturlOpenCurrentBranchWrapper() {
        let urlParams = await getUrlParams();

        // Find conf according to the domain of repo
        let conf = repoConf.find((item) => {
            return item.domain == urlParams.domain;
        });

        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = pathHandler.dirname(fileName);
        let branchName = await getGitCurrentBranch(dirName);
        urlParams.revision = branchName;

        let url = conf.url;
        if ('urlBranch' in conf) {
            url = conf.urlBranch;
        }

        if (urlParams.line_end != urlParams.line && 'lineRange' in conf) {
            url += conf.lineRange;
        } else if ('line' in conf) {
            url += conf.line;
        }

        url = buildUrl(url, urlParams);
        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    async function giturlOpenCurrentCommitWrapper() {
        let urlParams = await getUrlParams();

        // Find conf according to the domain of repo
        let conf = repoConf.find((item) => {
            return item.domain == urlParams.domain;
        });

        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = pathHandler.dirname(fileName);
        let commitId = await getGitCurrentCommit(dirName, fileName);
        urlParams.revision = commitId;

        let url = conf.url;
        if ('urlCommit' in conf) {
            url = conf.urlCommit;
        }

        if (urlParams.line_end != urlParams.line && 'lineRange' in conf) {
            url += conf.lineRange;
        } else if ('line' in conf) {
            url += conf.line;
        }

        url = buildUrl(url, urlParams);
        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    function readUserConfig() {
        const config = vscode.workspace.getConfiguration('giturl');

        if (config.repos && Array.isArray(config.repos)) {
            repoConf = repoConf.concat(config.repos);
        }
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
