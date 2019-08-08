const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const util = require('util');
    const exec = util.promisify(require('child_process').exec);
    const pathHandler = require('path');
    const urlHandler = require('url');

    let repoConf = [
        {
            domain: 'github.com',
            url: '{protocol}://{domain}/{base}/{name}/tree/{branch}/{path}#L{line}',
            urlCurrentBranch: '{protocol}://{domain}/{base}/{name}/tree/{branch}/{path}#L{line}',
            urlCommit: '{protocol}://{domain}/{base}/{name}/tree/{commit}/{path}#L{line}',
        },
        {
            domain: 'bitbucket.org',
            url: '{protocol}://{domain}/{base}/{name}/src/{branch}/{path}#lines-{line}',
            urlCurrentBranch: '{protocol}://{domain}/{base}/{name}/src/{branch}/{path}#lines-{line}',
            urlCommit: '{protocol}://{domain}/{base}/{name}/src/{commit}/{path}#lines-{line}',
        },
        {
            domain: 'gitlab.com',
            url: '{protocol}://{domain}/{base}/{name}/blob/{branch}/{path}#L{line}',
            urlCurrentBranch: '{protocol}://{domain}/{base}/{name}/blob/{branch}/{path}#L{line}',
            urlCommit: '{protocol}://{domain}/{base}/{name}/blob/{commit}/{path}#L{line}',
        },
    ];

    async function getGitConfig(dirname) {
        const { stdout, stderr } = await exec('git config --list', { cwd: dirname });

        let remoteRepoUrl = '';

        let lines = stdout.match(/[^\r\n]+/g);
        lines.forEach(line => {
            let res = line.match(/^remote\.origin\.url=(.+)\.git$/);
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

    async function getUrlParams() {
        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = pathHandler.dirname(fileName);

        let localBase = await getGitLocalBase(dirName);
        let {remoteRepoUrl} = await getGitConfig(dirName);
        let repoUrlParts = urlHandler.parse(remoteRepoUrl);

        let urlParams = {
            domain: repoUrlParts.hostname,
            protocol: 'https',
            base: pathHandler.basename(pathHandler.dirname(repoUrlParts.path)),
            name: pathHandler.basename(repoUrlParts.path),
            path: fileName.substring(localBase.length + 1),
            line: vscode.window.activeTextEditor.selection.active.line + 1,
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
        urlParams.branch = branchName;

        let url = buildUrl(conf.url, urlParams);
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
        urlParams.branch = branchName;

        let url = buildUrl(conf.urlCurrentBranch, urlParams);
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
        urlParams.commit = commitId;

        let url = buildUrl(conf.urlCommit, urlParams);
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

    disposables.push(vscode.commands.registerCommand('giturl.open', function () {
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
