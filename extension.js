const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    const util = require('util');
    const exec = util.promisify(require('child_process').exec);
    const path = require('path');

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

    async function giturlOpenWrapper() {
        let fileName = vscode.window.activeTextEditor.document.fileName;
        let dirName = path.dirname(fileName);

        let localBase = await getGitLocalBase(dirName);

        res = await getGitConfig(dirName);

        let activeLine = vscode.window.activeTextEditor.selection.active.line + 1;

        const urlHandler = require('url');
        const pathHandler = require('path');
        let repoSchema = 'https';
        let repoUrlParts = urlHandler.parse(res.remoteRepoUrl);
        let repoHost = repoUrlParts.hostname;
        let repoBase = pathHandler.basename(pathHandler.dirname(repoUrlParts.path));
        let repoName = pathHandler.basename(repoUrlParts.path);

        let url = null;
        if (repoHost.match(/github\.com/)) {
            url = repoSchema + '://' + repoHost + '/' + repoBase + '/' + repoName + '/tree/master' + fileName.replace(localBase, '') + '#L' + activeLine
        } else if (repoHost.match(/bitbucket\.org/)) {
            url = repoSchema + '://' + repoHost + '/' + repoBase + '/' + repoName + '/src/master' + fileName.replace(localBase, '') + '#lines-' + activeLine
        } else if (repoHost.match(/gitlab\.com/)) {
            url = repoSchema + '://' + repoHost + '/' + repoBase + '/' + repoName + '/blob/master' + fileName.replace(localBase, '') + '#L' + activeLine
        }

        vscode.env.openExternal(vscode.Uri.parse(url));
    }

    let disposable = vscode.commands.registerCommand('giturl.open', function () {
        vscode.window.showInformationMessage('Hello World!');
        giturlOpenWrapper();
    });

    context.subscriptions.push(disposable);
}
exports.activate = activate;

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
