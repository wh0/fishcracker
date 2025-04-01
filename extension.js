console.log('fishcracker enter extension.js'); // %%%

const vscode = require('vscode');

async function glitchBoot(/** @type {string} */ persistentToken) {
  const res = await fetch('https://api.glitch.com/boot?lastestProjectOnly=true', {
    headers: {
      'Authorization': persistentToken,
    },
  });
  if (!res.ok) throw new Error(`Glitch v0 boot response ${res.status} not ok, body ${await res.text()}`);
  return await res.json();
}

async function glitchProjectFromId(/** @type {string} */ persistentToken, /** @type {string} */ id) {
  const res = await fetch(`https://api.glitch.com/v1/projects/by/id?id=${id}`, {
    headers: {
      'Authorization': persistentToken,
    },
  });
  if (!res.ok) throw new Error(`Glitch projects by ID response ${res.status} not ok, body ${await res.text()}`);
  const body = await res.json();
  if (!(id in body)) throw new Error(`Glitch project ID ${id} not found`);
  return body[id];
}

async function glitchProjectFromDomain(/** @type {string} */ persistentToken, /** @type {string} */ domain) {
  const res = await fetch(`https://api.glitch.com/v1/projects/by/domain?domain=${domain}`, {
    headers: {
      'Authorization': persistentToken,
    },
  });
  if (!res.ok) throw new Error(`Glitch projects by domain response ${res.status} not ok, body ${await res.text()}`);
  const body = await res.json();
  if (!(domain in body)) throw new Error(`Glitch project domain ${domain} not found`);
  return body[domain];
}

function glitchOt(/** @type {string} */ persistentToken, /** @type {string} */ projectId) {
  const WebSocket = require('ws');
  return new WebSocket(`wss://api.glitch.com/${projectId}/ot?authorization=${persistentToken}`);
}

function glitchLogs(/** @type {string} */ persistentToken, /** @type {string} */ projectId) {
  const WebSocket = require('ws');
  return new WebSocket(`wss://api.glitch.com/${projectId}/logs?authorization=${persistentToken}`);
}

async function glitchTerminalToken(/** @type {string} */ persistentToken, /** @type {string} */ projectId) {
  const res = await fetch(`https://api.glitch.com/v1/projects/${projectId}/singlePurposeTokens/terminal`, {
    method: 'POST',
    headers: {
      'Authorization': persistentToken,
    },
  });
  if (!res.ok) throw new Error(`Glitch projects single purpose tokens terminal response ${res.status} not ok, body ${await res.text()}`);
  const body = await res.json();
  return /** @type {string} */ (body.token);
}

function glitchTerminalSocket(/** @type {string} */ token) {
  const io = require('socket.io-client');
  return io('https://api.glitch.com', {
    path: `/console/${token}/socket.io`,
    transports: ['websocket'],
  });
}

/**
 * @typedef {{
 *   type: 'add',
 *   docType: string,
 *   name: string,
 *   parentId: string,
 *   docId: string,
 * }} OtOpAdd
 * @typedef {{
 *   type: 'unlink',
 *   docId: string,
 * }} OtOpUnlink
 * @typedef {{
 *   type: 'rename',
 *   docId: string,
 *   newName: string,
 *   newParentId: string,
 * }} OtOpRename
 * @typedef {{
 *   type: 'insert',
 *   docId: string,
 *   position: number,
 *   text: string,
 * }} OtOpInsert
 * @typedef {{
 *   type: 'remove',
 *   docId: string,
 *   position: number,
 *   text: string,
 * }} OtOpRemove
 * @typedef {(
 *   OtOpAdd |
 *   OtOpUnlink |
 *   OtOpRename |
 *   OtOpInsert |
 *   OtOpRemove
 * )} OtOp
 * @typedef {{
 *   id: string,
 *   version: number,
 *   ops: OtOp[],
 * }} OtOpList
 * @typedef {{
 *   docId: string,
 *   docType: 'file' | 'directory',
 * }} OtPartialDoc
 * @typedef {{
 *   docId: string,
 *   name: string,
 *   parentId: string,
 *   createTime: number,
 *   modifyTime: number,
 * }} OtDocCommon
 * @typedef {OtDocCommon & {
 *   docType: 'directory',
 *   children: {[name: string]: OtPartialDoc},
 * }} OtDocDirectory
 * @typedef {OtDocCommon & {
 *   docType: 'file',
 *   content: string,
 * }} OtDocFileText
 * @typedef {OtDocCommon & {
 *   docType: 'file',
 *   base64Content: string,
 * }} OtDocFileBinary
 * @typedef {OtDocDirectory | OtDocFileText | OtDocFileBinary} OtDoc
 */

function otNewId() {
  return Math.random().toString(36).slice(2);
}

/**
 * @typedef {{resolve: any, reject: any}} Resolvers
 */

/**
 * @typedef {{
 *   ws: import('ws').WebSocket,
 *   clientId: string | null,
 *   version: number | null,
 *   docs: {[docId: string]: OtDoc},
 *   dotId: string | null,
 *   submittedOpLists: {[opListId: string]: OtOpList},
 *   openPromised: Promise<void> | null,
 *   masterRequested: Resolvers | null,
 *   masterPromised: Promise<void> | null,
 *   registerRequested: {[docId: string]: Resolvers},
 *   registerPromised: {[docId: string]: Promise<void>},
 *   opListRequested: {[opListid: string]: Resolvers},
 *   onclose: (() => void) | null,
 *   onbeforeop: ((op: OtOp) => void) | null,
 *   onafterop: ((op: OtOp) => void) | null,
 * }} OtClient
 */

function otClientNamesFromDocId(/** @type {OtClient} */ c, /** @type {string} */ docId) {
  const names = [];
  while (docId !== c.dotId) {
    const doc = c.docs[docId];
    names.unshift(doc.name);
    docId = doc.parentId;
  }
  return names;
}

function otClientApplyOpList(/** @type {OtClient} */ c, /** @type {OtOpList} */ opList, /** @type {number} */ now) {
  c.version = opList.version + 1;
  for (const op of opList.ops) {
    if (c.onbeforeop) {
      c.onbeforeop(op);
    }
    switch (op.type) {
      case 'add': {
        const parentDoc = /** @type {OtDocDirectory} */ (c.docs[op.parentId]);
        switch (op.docType) {
          case 'directory': {
            c.docs[op.docId] = {
              docId: op.docId,
              name: op.name,
              parentId: op.parentId,
              createTime: now,
              modifyTime: now,
              docType: 'directory',
              children: {},
            };
            parentDoc.children[op.name] = {docId: op.docId, docType: 'directory'};
            break;
          }
          case 'file': {
            c.docs[op.docId] = {
              docId: op.docId,
              name: op.name,
              parentId: op.parentId,
              createTime: now,
              modifyTime: now,
              docType: 'file',
              content: '',
            };
            parentDoc.children[op.name] = {docId: op.docId, docType: 'file'};
            break;
          }
        }
        parentDoc.modifyTime = now;
        break;
      }
      case 'unlink': {
        const doc = c.docs[op.docId];
        const parentDoc = /** @type {OtDocDirectory} */ (c.docs[doc.parentId]);
        delete parentDoc.children[doc.name];
        delete c.docs[op.docId];
        parentDoc.modifyTime = now;
        break;
      }
      case 'rename': {
        const doc = c.docs[op.docId];
        const oldParentDoc = /** @type {OtDocDirectory} */ (c.docs[doc.parentId]);
        const partialDoc = oldParentDoc.children[doc.name];
        delete oldParentDoc.children[doc.name];
        oldParentDoc.modifyTime = now;
        doc.name = op.newName;
        doc.parentId = op.newParentId;
        const newParentDoc = /** @type {OtDocDirectory} */ (c.docs[op.newParentId]);
        newParentDoc.children[op.newName] = partialDoc;
        newParentDoc.modifyTime = now;
        break;
      }
      case 'insert': {
        const doc = /** @type {OtDocFileText} */ (c.docs[op.docId]);
        doc.content = doc.content.slice(0, op.position) + op.text + doc.content.slice(op.position);
        doc.modifyTime = now;
        break;
      }
      case 'remove': {
        const doc = /** @type {OtDocFileText} */ (c.docs[op.docId]);
        doc.content = doc.content.slice(0, op.position) + doc.content.slice(op.position + op.text.length);
        doc.modifyTime = now;
        break;
      }
    }
    if (c.onafterop) {
      c.onafterop(op);
    }
  }
}

function otClientCreate(/** @type {string} */ persistentToken, /** @type {string} */ projectId) {
  console.log('ot connecting'); // %%%
  const /** @type {OtClient} */ c = {
    ws: glitchOt(persistentToken, projectId),
    clientId: null,
    version: null,
    docs: {},
    dotId: null,
    submittedOpLists: {},
    openPromised: null,
    masterRequested: null,
    masterPromised: null,
    registerRequested: {},
    registerPromised: {},
    opListRequested: {},
    onclose: null,
    onbeforeop: null,
    onafterop: null,
  };
  let /** @type {Resolvers} */ openRequested;
  c.openPromised = new Promise((resolve, reject) => {
    openRequested = {resolve, reject};
  });
  c.ws.onopen = (e) => {
    console.log('ot open'); // %%%
    openRequested.resolve();
  };
  c.ws.onclose = (e) => {
    console.log('ot close', e.code, e.reason); // %%%
    if (c.onclose) {
      c.onclose();
    }
    const closeError = new Error(`Glitch OT closed: ${e.code} ${e.reason}`);
    openRequested.reject(closeError);
    if (c.masterRequested) {
      c.masterRequested.reject(closeError);
    }
    for (const docId in c.registerRequested) {
      c.registerRequested[docId].reject(closeError);
    }
    for (const opListId in c.opListRequested) {
      c.opListRequested[opListId].reject(closeError);
    }
  };
  c.ws.onerror = (e) => {
    console.error('ot error', e); // %%%
  };
  c.ws.onmessage = (e) => {
    const msg = JSON.parse(/** @type {string} */ (e.data));
    console.log('ot <', msg); // %%%
    switch (msg.type) {
      case 'master-state': {
        c.version = msg.state.version;
        c.dotId = msg.state.documents['root'].children['.'];
        const masterRequested = /** @type {Resolvers} */ (c.masterRequested);
        c.masterRequested = null;
        masterRequested.resolve();
        break;
      }
      case 'register-document': {
        const now = Date.now();
        const doc = msg.document;
        doc.createTime = now;
        doc.modifyTime = now;
        c.docs[doc.docId] = doc;
        const registerRequested = c.registerRequested[doc.docId];
        delete c.registerRequested[doc.docId];
        registerRequested.resolve();
        break;
      }
      case 'accepted-oplist': {
        const now = Date.now();
        const opList = msg.opList;
        const submittedOpList = c.submittedOpLists[opList.id];
        delete c.submittedOpLists[opList.id];
        otClientApplyOpList(c, submittedOpList, now);
        const opListRequested = c.opListRequested[opList.id];
        delete c.opListRequested[opList.id];
        opListRequested.resolve(true);
        break;
      }
      case 'rejected-oplist': {
        const opList = msg.opList;
        const opListRequested = c.opListRequested[opList.id];
        delete c.opListRequested[opList.id];
        opListRequested.resolve(false);
        break;
      }
      case 'master-oplist': {
        const now = Date.now();
        const opList = msg.opList;
        otClientApplyOpList(c, opList, now);
        break;
      }
    }
  };
  return c;
}

function otClientSend(/** @type {OtClient} */ c, /** @type {any} */ msg) {
  console.log('ot >', msg); // %%%
  c.ws.send(JSON.stringify(msg));
}

function otClientRequestMaster(/** @type {OtClient} */ c) {
  if (!c.masterPromised) {
    c.clientId = otNewId();
    c.masterPromised = new Promise((resolve, reject) => {
      c.masterRequested = {resolve, reject};
      otClientSend(c, {
        type: 'master-state',
        clientId: c.clientId,
      });
    });
  }
  return c.masterPromised;
}

function otClientRequestRegister(/** @type {OtClient} */ c, /** @type {string} */ docId) {
  if (!(docId in c.registerPromised)) {
    c.registerPromised[docId] = new Promise((resolve, reject) => {
      c.registerRequested[docId] = {resolve, reject};
      otClientSend(c, {
        type: 'register-document',
        docId,
      });
    });
  }
  return c.registerPromised[docId];
}

function otClientSendOps(/** @type {OtClient} */ c, /** @type {OtOp[]} */ ops) {
  const opListId = otNewId();
  const opList = {
    id: opListId,
    version: /** @type {number} */ (c.version),
    ops,
  };
  c.submittedOpLists[opListId] = opList;
  return /** @type {Promise<boolean>} */ (new Promise((resolve, reject) => {
    c.opListRequested[opListId] = {resolve, reject};
    otClientSend(c, {
      type: 'client-oplist',
      opList,
    });
  }));
}

exports.activate = (/** @type {vscode.ExtensionContext} */ context) => {
  console.log('fishcracker enter activate'); // %%%

  async function fcGetPersistentTokenFromSecret() {
    return await context.secrets.get('persistent_token') || null;
  }

  async function fcSavePersistentToken(/** @type {string} */ persistentToken) {
    await context.secrets.store('persistent_token', persistentToken);
  }

  async function fcDeletePersistentToken() {
    await context.secrets.delete('persistent_token');
  }

  async function fcPromptPersistentToken() {
    return await vscode.window.showInputBox({
      prompt: 'Persistent Token',
      password: true,
      ignoreFocusOut: true,
    }) || null;
  }

  let fcPersistentTokenPrompted = false;

  async function fcMaybePromptPersistentToken() {
    if (fcPersistentTokenPrompted) return null;
    fcPersistentTokenPrompted = true;
    return await fcPromptPersistentToken();
  }

  async function fcGetPersistentTokenHowever() {
    const persistentTokenSecret = await fcGetPersistentTokenFromSecret();
    if (persistentTokenSecret) return persistentTokenSecret;
    const persistentTokenPrompted = await fcMaybePromptPersistentToken();
    if (persistentTokenPrompted) {
      await fcSavePersistentToken(persistentTokenPrompted);
      return persistentTokenPrompted;
    }
    return null;
  }

  async function fcGetPersistentToken() {
    const persistentToken = await fcGetPersistentTokenHowever();
    if (!persistentToken) throw new Error('Glitch persistent token unset. Run Sign in with Glitch Persistent Token');
    return persistentToken;
  }

  function fcGetWorkspaceFolders() {
    if (!vscode.workspace.workspaceFolders) return [];
    return vscode.workspace.workspaceFolders.filter((workspaceFolder) => workspaceFolder.uri.scheme === 'fishcracker');
  }

  /** @typedef {{id: string, name: string}} FcProjectInfo */

  function fcProjectInfoFromWorkspaceFolder(/** @type {vscode.WorkspaceFolder} */ workspaceFolder) {
    return /** @type {FcProjectInfo} */ ({
      id: workspaceFolder.uri.authority,
      name: workspaceFolder.name,
    });
  }

  async function fcProjectInfoFromProject(/** @type {{id: string, domain: string}} */ project) {
    return /** @type {FcProjectInfo} */ ({
      id: project.id,
      name: project.domain,
    });
  }

  async function fcGetProjectInfoFromActiveTextEditor() {
    const activeTextEditor = vscode.window.activeTextEditor;
    if (!activeTextEditor) return null;
    if (activeTextEditor.document.uri.scheme !== 'fishcracker') return null;
    const projectId = activeTextEditor.document.uri.scheme;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeTextEditor.document.uri);
    if (workspaceFolder) return fcProjectInfoFromWorkspaceFolder(workspaceFolder);
    const project = await glitchProjectFromId(projectId);
    return fcProjectInfoFromProject(project);
  }

  function fcGetProjectInfoFromWorkspaceFolders() {
    const workspaceFolders = fcGetWorkspaceFolders();
    if (workspaceFolders.length !== 1) return null;
    return fcProjectInfoFromWorkspaceFolder(workspaceFolders[0]);
  }

  async function fcPromptNewProjectInfo() {
    const persistentToken = await fcGetPersistentToken();
    const projectDomainPrompted = await vscode.window.showInputBox({prompt: 'Project Domain'});
    if (!projectDomainPrompted) return null;
    const project = await glitchProjectFromDomain(persistentToken, projectDomainPrompted);
    return fcProjectInfoFromProject(project);
  }

  async function fcPromptProjectInfo() {
    const workspaceFolders = fcGetWorkspaceFolders();
    if (workspaceFolders.length >= 1) {
      const /** @type {({workspaceFolder: vscode.WorkspaceFolder, label: string} | {other: true, label: string})[]} */ items = workspaceFolders.map((workspaceFolder) => ({workspaceFolder, label: workspaceFolder.name}));
      items.push({other: true, label: 'Other'});
      const itemPrompted = await vscode.window.showQuickPick(items);
      if (!itemPrompted) return null;
      if ('workspaceFolder' in itemPrompted) return fcProjectInfoFromWorkspaceFolder(itemPrompted.workspaceFolder);
    }
    return await fcPromptNewProjectInfo();
  }

  async function fcGetProjectInfoHowever() {
    return (
      await fcGetProjectInfoFromActiveTextEditor() ||
      fcGetProjectInfoFromWorkspaceFolders() ||
      await fcPromptProjectInfo()
    );
  }

  function fcNamesFromPath(/** @type {string} */ path) {
    const names = path.split('/');
    names.shift();
    if (names[0] === '') return [];
    return names;
  }

  function fcPathFromNames(/** @type {string[]} */ names) {
    return '/' + names.join('/');
  }

  function fcRequireSaneAuthority(/** @type {vscode.Uri} */ uri) {
    // I've seen the node_modules search go all the way up to //node_modules,
    // which is not a proper project ID.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uri.authority)) throw vscode.FileSystemError.FileNotFound(uri);
  }

  function fcUriFromDocId(/** @type {string} */ projectId, /** @type {OtClient} */ c, /** @type {string} */ docId) {
    const names = otClientNamesFromDocId(c, docId);
    const path = fcPathFromNames(names);
    return vscode.Uri.from({scheme: 'fishcracker', authority: projectId, path});
  }

  function fcFileTypeFromDocType(/** @type {'directory' | 'file'} */ docType) {
    return {
      'directory': vscode.FileType.Directory,
      'file': vscode.FileType.File,
    }[docType];
  }

  function fcFileSize(/** @type {OtDocFileText | OtDocFileBinary} */ doc) {
    if ('base64Content' in doc) {
      return atob(doc.base64Content).length;
    } else {
      return new TextEncoder().encode(doc.content).length;
    }
  }

  function fcFileBytes(/** @type {OtDocFileText | OtDocFileBinary} */ doc) {
    if ('base64Content' in doc) {
      const binaryStr = atob(doc.base64Content);
      const byteLength = binaryStr.length;
      const bytes = new Uint8Array(byteLength);
      for (let i = 0; i < byteLength; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes;
    }
    return new TextEncoder().encode(doc.content);
  }

  async function fcSendAddDirectory(/** @type {OtClient} */ c, /** @type {OtDocDirectory} */ parentDoc, /** @type {string} */ name) {
    const docId = otNewId();
    while (true) {
      if (!(parentDoc.docId in c.docs)) break;
      if (name in parentDoc.children) break;
      const accepted = await otClientSendOps(c, [
        {
          type: 'add',
          docType: 'directory',
          name,
          parentId: parentDoc.docId,
          docId,
        },
      ]);
      if (accepted) break;
      throw vscode.FileSystemError.Unavailable('Rejected'); // %%%
    }
  }

  async function fcSendAddFile(/** @type {OtClient} */ c, /** @type {OtDocDirectory} */ parentDoc, /** @type {string} */ name, /** @type {string} */ content) {
    const docId = otNewId();
    while (true) {
      if (!(parentDoc.docId in c.docs)) break;
      if (name in parentDoc.children) break;
      const accepted = await otClientSendOps(c, [
        {
          type: 'add',
          docType: 'file',
          name,
          parentId: parentDoc.docId,
          docId,
        },
        {
          type: 'insert',
          docId,
          position: 0,
          text: content,
        },
      ]);
      if (accepted) break;
      throw vscode.FileSystemError.Unavailable('Rejected'); // %%%
    }
  }

  async function fcSendUnlink(/** @type {OtClient} */ c, /** @type {OtDoc} */ doc) {
    while (true) {
      if (!(doc.docId in c.docs)) break;
      const accepted = await otClientSendOps(c, [
        {
          type: 'unlink',
          docId: doc.docId,
        },
      ]);
      if (accepted) break;
      throw vscode.FileSystemError.Unavailable('Rejected'); // %%%
    }
  }

  async function fcSendRename(/** @type {OtClient} */ c, /** @type {OtDoc} */ doc, /** @type {OtDocDirectory} */ newParentDoc, /** @type {string} */ newName) {
    while (true) {
      if (!(doc.docId in c.docs)) break;
      if (!(newParentDoc.docId in c.docs)) break;
      if (newName in newParentDoc.children) break;
      const accepted = await otClientSendOps(c, [
        {
          type: 'rename',
          docId: doc.docId,
          newName,
          newParentId: newParentDoc.docId,
        },
      ]);
      if (accepted) break;
      throw vscode.FileSystemError.Unavailable('Rejected'); // %%%
    }
  }

  async function fcSendReplaceContent(/** @type {OtClient} */ c, /** @type {OtDocFileText} */ doc, /** @type {string} */ content) {
    while (true) {
      if (!(doc.docId in c.docs)) break;
      const accepted = await otClientSendOps(c, [
        {
          type: 'remove',
          docId: doc.docId,
          position: 0,
          text: doc.content,
        },
        {
          type: 'insert',
          docId: doc.docId,
          position: 0,
          text: content,
        },
      ]);
      if (accepted) break;
      throw vscode.FileSystemError.Unavailable('Rejected'); // %%%
    }
  }

  async function fcSendReplaceFile(/** @type {OtClient} */ c, /** @type {OtDocFileBinary} */ doc, /** @type {string} */ content) {
    const docId = otNewId();
    while (true) {
      if (!(doc.docId in c.docs)) break;
      const accepted = await otClientSendOps(c, [
        {
          type: 'unlink',
          docId: doc.docId,
        },
        {
          type: 'add',
          docType: 'file',
          name: doc.name,
          parentId: doc.parentId,
          docId,
        },
        {
          type: 'insert',
          docId,
          position: 0,
          text: content,
        },
      ]);
      if (accepted) break;
      throw vscode.FileSystemError.Unavailable('Rejected'); // %%%
    }
  }

  const /** @type {vscode.EventEmitter<vscode.FileChangeEvent[]>} */ didChangeFileEmitter = new vscode.EventEmitter();
  context.subscriptions.push(didChangeFileEmitter);

  const /** @type {{[projectId: string]: vscode.Disposable}} */ fcOtDisposables = {};
  context.subscriptions.push(new vscode.Disposable(() => {
    for (const projectId in fcOtDisposables) {
      fcOtDisposables[projectId].dispose();
    }
  }));

  const /** @type {{[projectId: string]: Promise<OtClient>}} */ fcOtClientsReady = {};

  function fcGetReadyOtClient(/** @type {string} */ projectId) {
    if (!(projectId in fcOtClientsReady)) {
      let disposed = false;
      let /** @type {OtClient | null} */ cHandle = null;
      const disposable = new vscode.Disposable(() => {
        disposed = true;
        if (cHandle) {
          cHandle.ws.close();
        }
      });
      fcOtDisposables[projectId] = disposable;
      function cleanup() {
        delete fcOtDisposables[projectId];
        delete fcOtClientsReady[projectId];
      }
      fcOtClientsReady[projectId] = (async () => {
        let persistentToken, c;
        try {
          persistentToken = await fcGetPersistentToken();
          if (disposed) throw new Error('Disposed');
          c = otClientCreate(persistentToken, projectId);
        } catch (e) {
          cleanup();
          throw e;
        }
        c.onclose = () => {
          cHandle = null;
          cleanup();
        };
        c.onbeforeop = (op) => {
          switch (op.type) {
            case 'unlink':
            case 'rename':
              didChangeFileEmitter.fire([{uri: fcUriFromDocId(projectId, c, op.docId), type: vscode.FileChangeType.Deleted}]);
              break;
          }
        };
        c.onafterop = (op) => {
          switch (op.type) {
            case 'add':
            case 'rename':
              didChangeFileEmitter.fire([{uri: fcUriFromDocId(projectId, c, op.docId), type: vscode.FileChangeType.Created}]);
              break;
            case 'insert':
            case 'remove':
              didChangeFileEmitter.fire([{uri: fcUriFromDocId(projectId, c, op.docId), type: vscode.FileChangeType.Changed}]);
              break;
          }
        };
        cHandle = c;
        try {
          await c.openPromised;
          await otClientRequestMaster(c);
          return c;
        } catch (e) {
          c.ws.close();
          throw e;
        }
      })();
    }
    return fcOtClientsReady[projectId];
  }

  async function fcRequireDoc(/** @type {OtClient} */ c, /** @type {string} */ docId) {
    if (!(docId in c.docs)) {
      await otClientRequestRegister(c, docId);
    }
    if (!(docId in c.docs)) throw vscode.FileSystemError.FileNotFound(docId);
    return c.docs[docId];
  }

  /** @return {asserts doc is OtDocDirectory} */
  function fcRequireDir(/** @type {OtDoc} */ doc) {
    if (doc.docType !== 'directory') throw vscode.FileSystemError.FileNotADirectory(doc.docId);
  }

  function fcRequireChild(/** @type {OtDocDirectory} */ doc, /** @type {string} */ name) {
    if (!(name in doc.children)) throw vscode.FileSystemError.FileNotFound(`${doc.docId}/${name}`);
    return doc.children[name];
  }

  function fcRequireNotChild(/** @type {OtDocDirectory} */ doc, /** @type {string} */ name) {
    if (name in doc.children) throw vscode.FileSystemError.FileExists(`${doc.docId}/${name}`);
  }

  /** @return {asserts doc is OtDocFileText | OtDocFileBinary} */
  function fcRequireFile(/** @type {OtDoc} */ doc) {
    if (doc.docType !== 'file') throw vscode.FileSystemError.FileIsADirectory(doc.docId);
  }

  async function fcResolveDoc(/** @type {OtClient} */ c, /** @type {string[]} */ names) {
    let docId = /** @type {string} */ (c.dotId);
    let doc = await fcRequireDoc(c, docId);
    for (const name of names) {
      fcRequireDir(doc);
      docId = fcRequireChild(doc, name).docId;
      doc = await fcRequireDoc(c, docId);
    }
    return doc;
  }

  const /** @type {{[projectId: string]: vscode.Disposable}} */ fcLogsDisposables = {};
  context.subscriptions.push(new vscode.Disposable(() => {
    for (const projectId in fcLogsDisposables) {
      fcLogsDisposables[projectId].dispose();
    }
  }));

  const /** @type {{[projectId: string]: true}} */ fcLogsStreaming = {};

  function fcStreamLogs(/** @type {string} */ projectId, /** @type {vscode.LogOutputChannel} */ logOutputChannel) {
    if (!(projectId in fcLogsStreaming)) {
      let disposed = false;
      let /** @type {import('ws').WebSocket | null} */ wsHandle = null;
      const disposable = new vscode.Disposable(() => {
        disposed = true;
        if (wsHandle) {
          wsHandle.close();
        }
      });
      fcLogsDisposables[projectId] = disposable;
      function cleanup() {
        delete fcLogsDisposables[projectId];
        delete fcLogsStreaming[projectId];
      }
      function connect() {
        (async () => {
          let persistentToken, ws;
          try {
            persistentToken = await fcGetPersistentToken();
            if (disposed) throw new Error('Disposed');
            ws = glitchLogs(persistentToken, projectId);
          } catch (e) {
            console.error(e);
            logOutputChannel.error('error connecting to logs', e);
            cleanup();
            return;
          }
          let /** @type {NodeJS.Timeout | null} */ keepAliveInterval = null;
          ws.onopen = (e) => {
            console.log('logs open', e); // %%%
            keepAliveInterval = setInterval(() => {
              ws.send('keep alive');
            }, 30000);
          };
          ws.onclose = (e) => {
            console.log('logs close', e.code, e.reason); // %%%
            logOutputChannel.error('logs close', e.code, e.reason);
            if (keepAliveInterval) {
              clearInterval(keepAliveInterval);
              keepAliveInterval = null;
            }
            wsHandle = null;
            // %%% reconnect if not disposed
            cleanup();
          };
          ws.onerror = (e) => {
            console.error('logs error', e); // %%%
            logOutputChannel.error('logs error', e);
          };
          ws.onmessage = (e) => {
            const msg = JSON.parse(/** @type {string} */ (e.data));
            if (msg.process !== 'signal') {
              if (msg.stream === 'stderr') {
                logOutputChannel.error(msg.text);
              } else {
                logOutputChannel.info(msg.text);
              }
            }
          };
          wsHandle = ws;
        })();
      }
      connect();
      fcLogsStreaming[projectId] = true;
    }
  }

  const /** @type {Set<vscode.Disposable>} */ fcTerminalDisposables = new Set();
  context.subscriptions.push(new vscode.Disposable(() => {
    for (const disposable of fcTerminalDisposables) {
      disposable.dispose();
    }
  }));

  async function fcCreatePseudoterminal(/** @type {string} */ projectId) {
    let disposed = false;
    let /** @type {import('socket.io-client').Socket | null} */ socketHandle = null;
    const disposable = new vscode.Disposable(() => {
      disposed = true;
      if (socketHandle) {
        socketHandle.close();
      }
    });
    function cleanup() {
      fcTerminalDisposables.delete(disposable);
    }
    let terminalToken;
    try {
      const persistentToken = await fcGetPersistentToken();
      terminalToken = await glitchTerminalToken(persistentToken, projectId);
    } catch (e) {
      cleanup();
      throw e;
    }
    const /** @type {vscode.EventEmitter<string>} */ didWriteEmitter = new vscode.EventEmitter();
    const /** @type {vscode.EventEmitter<void | number>} */ didCloseEmitter = new vscode.EventEmitter();
    return /** @type {vscode.Pseudoterminal} */ ({
      onDidWrite: didWriteEmitter.event,
      onDidClose: didCloseEmitter.event,
      open(initialDimensions) {
        console.log('pty open', initialDimensions); // %%%
        let socket;
        try {
          if (disposed) throw new Error('Disposed');
          socket = glitchTerminalSocket(terminalToken);
        } catch (e) {
          cleanup();
          throw e;
        }
        socket.once('connect', () => {
          console.log('pty socket connect'); // %%%
        });
        socket.once('disconnect', (/** @type {string} */ reason) => {
          console.log('pty socket disconnect', reason); // %%%
          socketHandle = null;
          cleanup();
          didCloseEmitter.fire();
        });
        socket.on('error', (/** @type {any} */ e) => {
          console.error('pty socket error', e); // %%%
        });
        socket.once('login', () => {
          console.log('pty socket login'); // %%%
        });
        socket.once('logout', () => {
          console.log('pty socket logout'); // %%%
          socket.close();
        });
        socket.on('data', (/** @type {string} */ data) => {
          didWriteEmitter.fire(data);
        });
        socketHandle = socket;
        try {
          if (initialDimensions) {
            socket.emit('resize', {
              cols: initialDimensions.columns,
              rows: initialDimensions.rows,
            });
          }
        } catch (e) {
          socket.close();
          throw e;
        }
      },
      close() {
        console.log('pty close'); // %%%
        if (socketHandle) {
          socketHandle.close();
        }
      },
      handleInput(data) {
        if (socketHandle) {
          socketHandle.emit('input', data);
        }
      },
      setDimensions(dimensions) {
        console.log('pty set dimensions', dimensions); // %%%
        if (socketHandle) {
          socketHandle.emit('resize', {
            cols: dimensions.columns,
            rows: dimensions.rows,
          });
        }
      },
    });
  }

  context.subscriptions.push(vscode.workspace.registerFileSystemProvider('fishcracker', {
    onDidChangeFile: didChangeFileEmitter.event,
    watch(uri, options) {
      console.log('fs watch', uri.toString(), options); // %%%
      fcRequireSaneAuthority(uri);
      const projectId = uri.authority;
      const names = fcNamesFromPath(uri.path);
      (async () => {
        const c = await fcGetReadyOtClient(projectId);
        await fcResolveDoc(c, names);
        // kind of don't want to honor recursive option
      })();
      return new vscode.Disposable(() => {
        console.log('fs watch disposed', uri.toString(), options); // %%%
      });
    },
    async stat(uri) {
      console.log('fs stat', uri.toString()); // %%%
      fcRequireSaneAuthority(uri);
      const projectId = uri.authority;
      const names = fcNamesFromPath(uri.path);
      const c = await fcGetReadyOtClient(projectId);
      const doc = await fcResolveDoc(c, names);
      const fileType = fcFileTypeFromDocType(doc.docType);
      let size = 0;
      if (doc.docType === 'file') {
        size = fcFileSize(doc);
      }
      return {
        type: fileType,
        ctime: doc.createTime,
        mtime: doc.modifyTime,
        size,
      };
    },
    async readDirectory(uri) {
      console.log('fs read directory', uri.toString()); // %%%
      fcRequireSaneAuthority(uri);
      const projectId = uri.authority;
      const names = fcNamesFromPath(uri.path);
      const c = await fcGetReadyOtClient(projectId);
      const doc = await fcResolveDoc(c, names);
      fcRequireDir(doc);
      const /** @type {[string, vscode.FileType][]} */ entries = [];
      for (const name in doc.children) {
        const partialDoc = doc.children[name];
        const fileType = fcFileTypeFromDocType(partialDoc.docType);
        entries.push([name, fileType]);
      }
      return entries;
    },
    async createDirectory(uri) {
      console.log('fs create directory', uri.toString()); // %%%
      fcRequireSaneAuthority(uri);
      const projectId = uri.authority;
      const parentNames = fcNamesFromPath(uri.path);
      if (parentNames.length < 1) throw vscode.FileSystemError.FileExists('.');
      const name = /** @type {string} */ (parentNames.pop());
      const c = await fcGetReadyOtClient(projectId);
      const parentDoc = await fcResolveDoc(c, parentNames);
      fcRequireDir(parentDoc);
      fcRequireNotChild(parentDoc, name);
      await fcSendAddDirectory(c, parentDoc, name);
    },
    async readFile(uri) {
      console.log('fs read file', uri.toString()); // %%%
      fcRequireSaneAuthority(uri);
      const projectId = uri.authority;
      const names = fcNamesFromPath(uri.path);
      const c = await fcGetReadyOtClient(projectId);
      const doc = await fcResolveDoc(c, names);
      fcRequireFile(doc);
      return fcFileBytes(doc);
    },
    async writeFile(uri, content, options) {
      console.log('fs write file', uri.toString(), options); // %%%
      fcRequireSaneAuthority(uri);
      const projectId = uri.authority;
      const parentNames = fcNamesFromPath(uri.path);
      if (parentNames.length < 1) throw vscode.FileSystemError.FileIsADirectory('.');
      const name = /** @type {string} */ (parentNames.pop());
      const contentStr = new TextDecoder('utf-8', {fatal: true}).decode(content);
      const c = await fcGetReadyOtClient(projectId);
      const parentDoc = await fcResolveDoc(c, parentNames);
      fcRequireDir(parentDoc);
      if (name in parentDoc.children) {
        if (!options.overwrite) throw vscode.FileSystemError.FileExists(`${parentDoc.docId}/${name}`);
        const doc = await fcRequireDoc(c, parentDoc.children[name].docId);
        fcRequireFile(doc);
        if ('base64Content' in doc) {
          await fcSendReplaceFile(c, doc, contentStr);
        } else {
          await fcSendReplaceContent(c, doc, contentStr);
        }
      } else {
        if (!options.create) throw vscode.FileSystemError.FileNotFound(`${parentDoc.docId}/${name}`);
        await fcSendAddFile(c, parentDoc, name, contentStr);
      }
    },
    async delete(uri, options) {
      console.log('fs delete', uri.toString(), options); // %%%
      fcRequireSaneAuthority(uri);
      const projectId = uri.authority;
      const names = fcNamesFromPath(uri.path);
      const c = await fcGetReadyOtClient(projectId);
      const doc = await fcResolveDoc(c, names);
      await fcSendUnlink(c, doc);
    },
    async rename(oldUri, newUri, options) {
      console.log('fs rename', oldUri.toString(), newUri.toString(), options); // %%%
      fcRequireSaneAuthority(oldUri);
      fcRequireSaneAuthority(newUri);
      if (oldUri.authority !== newUri.authority) throw new Error('Cross-project rename not supported');
      const projectId = oldUri.authority;
      const names = fcNamesFromPath(oldUri.path);
      const newParentNames = fcNamesFromPath(newUri.path);
      if (newParentNames.length < 1) throw vscode.FileSystemError.FileExists('.');
      const newName = /** @type {string} */ (newParentNames.pop());
      const c = await fcGetReadyOtClient(projectId);
      const doc = await fcResolveDoc(c, names);
      const newParentDoc = await fcResolveDoc(c, newParentNames);
      fcRequireDir(newParentDoc);
      fcRequireNotChild(newParentDoc, newName);
      await fcSendRename(c, doc, newParentDoc, newName);
    },
    // no custom `copy` implementation
  }, {isCaseSensitive: true}));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.test', async () => {
    // %%%
  }));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.auth.persistent_token', async () => {
    const persistentTokenPrompted = await fcPromptPersistentToken();
    if (persistentTokenPrompted) {
      await fcSavePersistentToken(persistentTokenPrompted);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.logout', async () => {
    await fcDeletePersistentToken();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.open_project', async () => {
    const projectInfoPrompted = await fcPromptNewProjectInfo();
    if (!projectInfoPrompted) return;
    let end = 0;
    if (vscode.workspace.workspaceFolders) {
      end = vscode.workspace.workspaceFolders.length;
    }
    const folderSpec = {
      uri: vscode.Uri.from({scheme: 'fishcracker', authority: projectInfoPrompted.id, path: '/'}),
      name: projectInfoPrompted.name,
    };
    vscode.workspace.updateWorkspaceFolders(end, 0, folderSpec);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.request_join', async () => {
    const projectInfo = await fcGetProjectInfoHowever();
    if (!projectInfo) return;
    const persistentToken = await fcGetPersistentToken();
    const {user} = await glitchBoot(persistentToken);
    const c = await fcGetReadyOtClient(projectInfo.id);
    const fallbackName = `fc-${(0x10000 + Math.floor(Math.random() * 0x10000)).toString(16).slice(1)}`;
    const nagUser = {
      avatarUrl: user.avatarUrl || 'https://fishcracker.glitch.me/join.png',
      avatarThumbnailUrl: user.avatarThumbnailUrl,
      awaitingInvite: true,
      id: user.id,
      name: user.name || fallbackName,
      login: user.login,
      color: user.color,
      projectPermission: {
        userId: user.id,
        projectId: projectInfo.id,
        accessLevel: 0,
      },
    };
    otClientSend(c, {
      type: 'broadcast',
      payload: {
        user: nagUser,
      },
    });
    vscode.window.showInformationMessage(`Requesting to join as ${nagUser.name}`);
  }));

  const /** @type {{[projectId: string]: vscode.LogOutputChannel}} */ fcLogOutputChannels = {};

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.logs', async () => {
    const projectInfo = await fcGetProjectInfoHowever();
    if (!projectInfo) return;
    if (!(projectInfo.id in fcLogOutputChannels)) {
      const createdLogOutputChannel = vscode.window.createOutputChannel(`Glitch Logs (${projectInfo.name})`, {log: true});
      fcLogOutputChannels[projectInfo.id] = createdLogOutputChannel;
      fcStreamLogs(projectInfo.id, createdLogOutputChannel);
    }
    fcLogOutputChannels[projectInfo.id].show();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.term_command', async () => {
    const projectInfo = await fcGetProjectInfoHowever();
    if (!projectInfo) return;
    const terminal = vscode.window.createTerminal({
      name: `Glitch Terminal (${projectInfo.name})`,
      pty: await fcCreatePseudoterminal(projectInfo.id),
    });
    terminal.show();
  }));

  context.subscriptions.push(vscode.window.registerTerminalProfileProvider('wh0.fishcracker.term', {
    async provideTerminalProfile(token) {
      console.log('tpp provide terminal profile'); // %%%
      const projectInfo = await fcGetProjectInfoHowever();
      if (!projectInfo) return null;
      return new vscode.TerminalProfile({
        name: `Glitch Terminal (${projectInfo.name})`,
        pty: await fcCreatePseudoterminal(projectInfo.id),
      });
    },
  }));
};
