const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const util = require('util');
    const exec = util.promisify(require('child_process').exec);
    const path = require('path');

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

    async function giturlOpenWrapper() {
        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = path.dirname(fileName);

        let localBase = await getGitLocalBase(dirName);
        let branchName = await getGitDefaultBranch(dirName);

        res = await getGitConfig(dirName);

        let activeLine = vscode.window.activeTextEditor.selection.active.line + 1;

        const urlHandler = require('url');
        const pathHandler = require('path');
        let repoSchema = 'https';
        let repoUrlParts = urlHandler.parse(res.remoteRepoUrl);
        let relativePath = fileName.substring(localBase.length + 1);
        let repoHost = repoUrlParts.hostname;
        let repoBase = pathHandler.basename(pathHandler.dirname(repoUrlParts.path));
        let repoName = pathHandler.basename(repoUrlParts.path);

        let url = null;
        repoConf.forEach(conf => {
            if (repoHost.match(conf.domain)) {
                url = conf.url;
                url = url.replace('{domain}', repoHost);
                url = url.replace('{protocol}', repoSchema);
                url = url.replace('{base}', repoBase);
                url = url.replace('{name}', repoName);
                url = url.replace('{path}', relativePath);
                url = url.replace('{line}', activeLine);
                url = url.replace('{branch}', branchName);
            }
        });

        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    async function giturlOpenCurrentBranchWrapper() {
        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = path.dirname(fileName);

        let localBase = await getGitLocalBase(dirName);
        let branchName = await getGitCurrentBranch(dirName);

        res = await getGitConfig(dirName);

        let activeLine = vscode.window.activeTextEditor.selection.active.line + 1;

        const urlHandler = require('url');
        const pathHandler = require('path');
        let repoSchema = 'https';
        let repoUrlParts = urlHandler.parse(res.remoteRepoUrl);
        let relativePath = fileName.substring(localBase.length + 1);
        let repoHost = repoUrlParts.hostname;
        let repoBase = pathHandler.basename(pathHandler.dirname(repoUrlParts.path));
        let repoName = pathHandler.basename(repoUrlParts.path);

        let url = null;
        repoConf.forEach(conf => {
            if (repoHost.match(conf.domain)) {
                url = conf.urlCurrentBranch;
                url = url.replace('{domain}', repoHost);
                url = url.replace('{protocol}', repoSchema);
                url = url.replace('{base}', repoBase);
                url = url.replace('{name}', repoName);
                url = url.replace('{path}', relativePath);
                url = url.replace('{line}', activeLine);
                url = url.replace('{branch}', branchName);
            }
        });

        if (url) {
            vscode.env.openExternal(vscode.Uri.parse(url));
        }
    }

    async function giturlOpenCurrentCommitWrapper() {
        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = path.dirname(fileName);

        let localBase = await getGitLocalBase(dirName);
        let commitId = await getGitCurrentCommit(dirName, fileName);

        res = await getGitConfig(dirName);

        let activeLine = vscode.window.activeTextEditor.selection.active.line + 1;

        const urlHandler = require('url');
        const pathHandler = require('path');
        let repoSchema = 'https';
        let repoUrlParts = urlHandler.parse(res.remoteRepoUrl);
        let relativePath = fileName.substring(localBase.length + 1);
        let repoHost = repoUrlParts.hostname;
        let repoBase = pathHandler.basename(pathHandler.dirname(repoUrlParts.path));
        let repoName = pathHandler.basename(repoUrlParts.path);

        let url = null;
        repoConf.forEach(conf => {
            if (repoHost.match(conf.domain)) {
                url = conf.urlCommit;
                url = url.replace('{domain}', repoHost);
                url = url.replace('{protocol}', repoSchema);
                url = url.replace('{base}', repoBase);
                url = url.replace('{name}', repoName);
                url = url.replace('{path}', relativePath);
                url = url.replace('{line}', activeLine);
                url = url.replace('{commit}', commitId);
            }
        });

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
