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

        let url = res.remoteRepoUrl + '/tree/master' + fileName.replace(localBase, '') + '#L' + activeLine;

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
