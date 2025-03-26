const vscode = require('vscode');
const /** @type {vscode.ExtensionContext} */ context = /** @type {never} */ (null);

async function simpleExec(/** @type {string} */ projectId, /** @type {string} */ command) {
  const persistentToken = await context.secrets.get('persistent_token');
  if (!persistentToken) throw new Error('Glitch persistent token not set');
  const res = await fetch(`https://api.glitch.com/projects/${projectId}/exec`, {
    method: 'POST',
    headers: {
      'Authorization': persistentToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      command,
    }),
  });
  if (res.ok) {
    const body = await res.json();
    return /** @type {string} */ (body.stdout);
  } else if (res.status === 500) {
    const body = await res.json();
    throw new Error(body.stderr);
  } else {
    throw new Error(`Glitch v0 projects exec response ${res.status} not ok, body ${await res.text()}`);
  }
}

const /** @type {vscode.EventEmitter<vscode.FileChangeEvent[]>} */ didChangeFileEmitter = new vscode.EventEmitter();
context.subscriptions.push(didChangeFileEmitter);

/** @satisfies {vscode.FileSystemProvider} */
const fs = {
  onDidChangeFile: didChangeFileEmitter.event,
  watch(uri, options) {
    console.log('watch', uri.toString(), options);
    return new vscode.Disposable(() => { });
  },
  async stat(uri) {
    console.log('stat', uri.toString());
    const projectId = uri.authority;
    const statOut = await simpleExec(projectId, `stat -c '%F:%W:%Y:%s:%a' "${uri.path}"`);
    const [typeStr, ctimeStr, mtimeStr, sizeStr, modeStr] = statOut.trim().split(':');
    let /** @type {vscode.FileType} */ type;
    switch (typeStr) {
      case 'regular file':
        type = vscode.FileType.File;
        break;
      case 'directory':
        type = vscode.FileType.Directory;
        break;
      case 'symbolic link':
        type = vscode.FileType.SymbolicLink;
        break;
      default:
        type = vscode.FileType.Unknown;
    }
    const ctime = +ctimeStr * 1000;
    const mtime = +mtimeStr * 1000;
    const size = +sizeStr;
    let permissions = /** @type {vscode.FilePermission} */ (0);
    const mode = parseInt(modeStr, 8);
    if ((mode & 0o400) === 0) {
      permissions |= vscode.FilePermission.Readonly;
    }
    return {type, ctime, mtime, size, permissions};
  },
  async readDirectory(uri) {
    console.log('readDirectory', uri.toString());
    const projectId = uri.authority;
    const lsOut = await simpleExec(projectId, `ls -AF "${uri.path}"`);
    const namesWithIndicator = lsOut.split('\n');
    namesWithIndicator.pop();
    return namesWithIndicator.map((nameWithIndicator) => {
      const nameSlice = nameWithIndicator.slice(-1);
      const nameSliced = nameWithIndicator.slice(0, -1);
      switch (nameSlice) {
        case '/':
          return [nameSliced, vscode.FileType.Directory];
        case '@':
          return [nameSliced, vscode.FileType.SymbolicLink];
        case '*':
        case '=':
        case '>':
        case '|':
          return [nameSliced, vscode.FileType.Unknown];
        default:
          return [nameWithIndicator, vscode.FileType.File];
      }
    });
  },
  async createDirectory(uri) {
    console.log('createDirectory', uri.toString());
    const projectId = uri.authority;
    await simpleExec(projectId, `mkdir "${uri.path}"`);
  },
  async readFile(uri) {
    console.log('readFile', uri.toString());
    const projectId = uri.authority;
    const contentStr = await simpleExec(projectId, `cat "${uri.path}"`);
    return new TextEncoder().encode(contentStr);
  },
  async writeFile(uri, content, options) {
    console.log('writeFile', uri.toString(), content.slice(0, 10), options);
    const projectId = uri.authority;
    const contentStr = new TextDecoder().decode(content);
    await simpleExec(projectId, `cat >"${uri.path}" <<G_EOF\n${contentStr}\nG_EOF`);
  },
  async delete(uri, options) {
    console.log('delete', uri.toString(), options);
    const projectId = uri.authority;
    await simpleExec(projectId, `rm -r "${uri.path}"`);
  },
  async rename(oldUri, newUri, options) {
    console.log('rename', oldUri.toString(), newUri.toString(), options);
    if (oldUri.authority !== newUri.authority) throw new Error('Cross-project rename not supported');
    const projectId = oldUri.authority;
    await simpleExec(projectId, `mv "${oldUri.path}" "${newUri.path}"`);
  },
  // no custom `copy` implementation
  async copy(source, destination, options) {
    console.log('copy', source.toString(), destination.toString(), options);
    if (source.authority !== destination.authority) throw new Error('Cross-project copy not supported');
    const projectId = source.authority;
    await simpleExec(projectId, `cp "${source.path}" "${destination.path}"`);
  },
};
