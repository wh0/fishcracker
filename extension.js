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

async function glitchAuthAnon() {
  const res = await fetch('https://api.glitch.com/v1/users/anon', {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Glitch users anon response ${res.status} not ok, body ${await res.text()}`);
  return await res.json();
}

async function glitchAuthEmailCode(/** @type {string} */ code) {
  const res = await fetch(`https://api.glitch.com/v1/auth/email/${code}`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Glitch auth email response ${res.status} not ok, body ${await res.text()}`);
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
 *   projectId: string,
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
  console.log('ot connecting', projectId); // %%%
  const /** @type {OtClient} */ c = {
    projectId,
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
    console.log('ot open', c.projectId); // %%%
    openRequested.resolve();
  };
  c.ws.onclose = (e) => {
    console.log('ot close', c.projectId, e.code, e.reason); // %%%
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
    console.error('ot error', c.projectId, e); // %%%
  };
  c.ws.onmessage = (e) => {
    const msg = JSON.parse(/** @type {string} */ (e.data));
    console.log('ot <', c.projectId, msg); // %%%
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
  console.log('ot >', c.projectId, msg); // %%%
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

  async function fcFailIfPersistentTokenSaved() {
    if (await fcGetPersistentTokenFromSecret()) {
      throw new Error('Persistent token already saved. Run Sign out of Glitch to authenticate again');
    }
  }

  const fcAuthItems = [
    {
      label: 'Use Sign-in Code',
      async run() {
        const codePrompted = await vscode.window.showInputBox({
          title: 'Sign in to Glitch',
          prompt: 'Code',
          ignoreFocusOut: true,
        });
        if (!codePrompted) return null;
        const {user} = await glitchAuthEmailCode(codePrompted);
        return /** @type {string} */ (user.persistentToken);
      },
    },
    {
      label: 'Create New Anonymous User',
      async run() {
        const user = await glitchAuthAnon();
        return /** @type {string} */ (user.persistentToken);
      },
    },
    {
      label: 'Use Persistent Token',
      async run() {
        const persistentTokenPrompted = await vscode.window.showInputBox({
          title: 'Sign in to Glitch',
          prompt: 'Persistent Token',
          password: true,
          ignoreFocusOut: true,
        });
        if (!persistentTokenPrompted) return null;
        return persistentTokenPrompted;
      },
    },
  ];

  async function fcPromptAuth() {
    const modePrompted = await vscode.window.showQuickPick(fcAuthItems, {
      title: 'Sign in to Glitch',
      ignoreFocusOut: true,
    });
    if (!modePrompted) return null;
    return await modePrompted.run();
  }

  async function fcEnsureAuthInteractive() {
    const persistentTokenSecret = await fcGetPersistentTokenFromSecret();
    if (persistentTokenSecret) return persistentTokenSecret;
    const persistentTokenPrompted = await fcPromptAuth();
    if (persistentTokenPrompted) {
      await fcSavePersistentToken(persistentTokenPrompted);
      return persistentTokenPrompted;
    }
    return null;
  }

  async function fcGetPersistentTokenQuiet() {
    const persistentTokenSecret = await fcGetPersistentTokenFromSecret();
    if (persistentTokenSecret) return persistentTokenSecret;
    throw new Error('Glitch persistent token unset. Run Sign in to Glitch');
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
    const projectId = activeTextEditor.document.uri.authority;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(activeTextEditor.document.uri);
    if (workspaceFolder) return fcProjectInfoFromWorkspaceFolder(workspaceFolder);
    const persistentToken = await fcGetPersistentTokenQuiet();
    const project = await glitchProjectFromId(persistentToken, projectId);
    return fcProjectInfoFromProject(project);
  }

  function fcGetProjectInfoFromWorkspaceFolders() {
    const workspaceFolders = fcGetWorkspaceFolders();
    if (workspaceFolders.length !== 1) return null;
    return fcProjectInfoFromWorkspaceFolder(workspaceFolders[0]);
  }

  async function fcPromptNewProjectInfo() {
    const persistentToken = await fcGetPersistentTokenQuiet();
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

  async function fcSendRequestJoin(/** @type {OtClient} */ c) {
    const persistentToken = await fcGetPersistentTokenQuiet();
    const {user} = await glitchBoot(persistentToken);
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
        projectId: c.projectId,
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
  }

  const /** @type {{[projectId: string]: Set<{path: string}>}} */ fcFsWatches = {};

  const /** @type {vscode.EventEmitter<vscode.FileChangeEvent[]>} */ fcFsDidChangeFileEmitter = new vscode.EventEmitter();
  context.subscriptions.push(fcFsDidChangeFileEmitter);

  /**
   * @typedef {{
   *   disposable: vscode.Disposable,
   *   cReadyPromised: Promise<OtClient>,
   * }} FcOtRecord
   */

  const /** @type {{[projectId: string]: FcOtRecord}} */ fcOtRecords = {};
  context.subscriptions.push(new vscode.Disposable(() => {
    for (const projectId in fcOtRecords) {
      fcOtRecords[projectId].disposable.dispose();
    }
  }));

  function fcOtGetReadyClient(/** @type {string} */ projectId) {
    if (!(projectId in fcOtRecords)) {
      let disposed = false;
      let /** @type {OtClient | null} */ cHandle = null;
      const /** @type {FcOtRecord} */ record = {
        disposable: new vscode.Disposable(() => {
          disposed = true;
          if (cHandle) {
            cHandle.ws.close();
          }
        }),
        cReadyPromised: /** @type {never} */ (null),
      };
      fcOtRecords[projectId] = record;
      function cleanup() {
        delete fcOtRecords[projectId];
        record.disposable.dispose();
        // %%% reconnect
      }
      record.cReadyPromised = (async () => {
        let persistentToken, c;
        try {
          persistentToken = await fcGetPersistentTokenQuiet();
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
              fcFsDidChangeFileEmitter.fire([{uri: fcUriFromDocId(projectId, c, op.docId), type: vscode.FileChangeType.Deleted}]);
              break;
          }
        };
        c.onafterop = (op) => {
          switch (op.type) {
            case 'add':
            case 'rename':
              fcFsDidChangeFileEmitter.fire([{uri: fcUriFromDocId(projectId, c, op.docId), type: vscode.FileChangeType.Created}]);
              break;
            case 'insert':
            case 'remove':
              fcFsDidChangeFileEmitter.fire([{uri: fcUriFromDocId(projectId, c, op.docId), type: vscode.FileChangeType.Changed}]);
              break;
          }
        };
        cHandle = c;
        try {
          await c.openPromised;
          await otClientRequestMaster(c);
          if (projectId in fcFsWatches) {
            await Promise.all(Array.from(fcFsWatches[projectId]).map(async (watch) => {
              try {
                const names = fcNamesFromPath(watch.path);
                await fcResolveDoc(c, names);
              } catch (e) {
                console.error(e);
              }
            }));
          }
          return c;
        } catch (e) {
          c.ws.close();
          throw e;
        }
      })();
    }
    return fcOtRecords[projectId].cReadyPromised;
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

  /**
   * @typedef {{
   *   disposable: vscode.Disposable,
   * }} FcLogsRecord
   */

  const /** @type {{[projectId: string]: FcLogsRecord}} */ fcLogsRecords = {};
  context.subscriptions.push(new vscode.Disposable(() => {
    for (const projectId in fcLogsRecords) {
      fcLogsRecords[projectId].disposable.dispose();
    }
  }));

  function fcStreamLogs(/** @type {string} */ projectId, /** @type {vscode.LogOutputChannel} */ logOutputChannel) {
    if (!(projectId in fcLogsRecords)) {
      let disposed = false;
      let /** @type {import('ws').WebSocket | null} */ wsHandle = null;
      const /** @type {FcLogsRecord} */ record = {
        disposable: new vscode.Disposable(() => {
          disposed = true;
          if (wsHandle) {
            wsHandle.close();
          }
        }),
      };
      fcLogsRecords[projectId] = record;
      function cleanup() {
        delete fcLogsRecords[projectId];
        record.disposable.dispose();
        // %%% reconnect
      }
      (async () => {
        let persistentToken, ws;
        try {
          persistentToken = await fcGetPersistentTokenQuiet();
          if (disposed) throw new Error('Disposed');
          ws = glitchLogs(persistentToken, projectId);
        } catch (e) {
          console.error(e);
          cleanup();
          return;
        }
        let /** @type {NodeJS.Timeout | null} */ keepAliveInterval = null;
        ws.onopen = (e) => {
          console.log('logs open', projectId, e); // %%%
          keepAliveInterval = setInterval(() => {
            ws.send('keep alive');
          }, 30000);
        };
        ws.onclose = (e) => {
          console.log('logs close', projectId, e.code, e.reason); // %%%
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
          }
          wsHandle = null;
          cleanup();
        };
        ws.onerror = (e) => {
          console.error('logs error', projectId, e); // %%%
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
  }

  let fcNextTerminalId = 0;

  /**
   * @typedef {{
   *   disposable: vscode.Disposable,
   * }} FcTerminalRecord
   */

  const /** @type {{[terminalId: number]: FcTerminalRecord}} */ fcTerminalRecords = {};
  context.subscriptions.push(new vscode.Disposable(() => {
    for (const terminalId in fcTerminalRecords) {
      fcTerminalRecords[terminalId].disposable.dispose();
    }
  }));

  async function fcCreatePseudoterminal(/** @type {string} */ projectId) {
    const terminalId = fcNextTerminalId++;
    console.log('pty create', terminalId, projectId); // %%%
    let disposed = false;
    let /** @type {import('socket.io-client').Socket | null} */ socketHandle = null;
    const record = {
      disposable: new vscode.Disposable(() => {
        disposed = true;
        if (socketHandle) {
          socketHandle.close();
        }
      }),
    };
    fcTerminalRecords[terminalId] = record;
    function cleanup() {
      delete fcTerminalRecords[terminalId];
      record.disposable.dispose();
    }
    let terminalToken;
    try {
      const persistentToken = await fcGetPersistentTokenQuiet();
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
        console.log('pty open', terminalId, initialDimensions); // %%%
        let socket;
        try {
          if (disposed) throw new Error('Disposed');
          socket = glitchTerminalSocket(terminalToken);
        } catch (e) {
          cleanup();
          throw e;
        }
        socket.once('connect', () => {
          console.log('pty socket connect', terminalId); // %%%
        });
        socket.once('disconnect', (/** @type {string} */ reason) => {
          console.log('pty socket disconnect', terminalId, reason); // %%%
          socketHandle = null;
          cleanup();
          didCloseEmitter.fire();
        });
        socket.on('error', (/** @type {any} */ e) => {
          console.error('pty socket error', terminalId, e); // %%%
        });
        socket.once('login', () => {
          console.log('pty socket login', terminalId); // %%%
        });
        socket.once('logout', () => {
          console.log('pty socket logout', terminalId); // %%%
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
        console.log('pty close', terminalId); // %%%
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
        console.log('pty set dimensions', terminalId, dimensions); // %%%
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
    onDidChangeFile: fcFsDidChangeFileEmitter.event,
    watch(uri, options) {
      console.log('fs watch', uri.toString(), options); // %%%
      fcRequireSaneAuthority(uri);
      const projectId = uri.authority;
      const names = fcNamesFromPath(uri.path);
      const watch = {path: uri.path};
      if (!(projectId in fcFsWatches)) {
        fcFsWatches[projectId] = new Set();
      }
      fcFsWatches[projectId].add(watch);
      const cPromised = fcOtGetReadyClient(projectId);
      (async () => {
        try {
          const c = await cPromised;
          await fcResolveDoc(c, names);
        } catch (e) {
          console.error(e);
        }
      })();
      return new vscode.Disposable(() => {
        console.log('fs watch disposed', uri.toString(), options); // %%%
        fcFsWatches[projectId].delete(watch);
        if (fcFsWatches[projectId].size === 0) {
          delete fcFsWatches[projectId];
        }
      });
    },
    async stat(uri) {
      console.log('fs stat', uri.toString()); // %%%
      fcRequireSaneAuthority(uri);
      const projectId = uri.authority;
      const names = fcNamesFromPath(uri.path);
      const c = await fcOtGetReadyClient(projectId);
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
      const c = await fcOtGetReadyClient(projectId);
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
      const c = await fcOtGetReadyClient(projectId);
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
      const c = await fcOtGetReadyClient(projectId);
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
      const c = await fcOtGetReadyClient(projectId);
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
      const c = await fcOtGetReadyClient(projectId);
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
      const c = await fcOtGetReadyClient(projectId);
      const doc = await fcResolveDoc(c, names);
      const newParentDoc = await fcResolveDoc(c, newParentNames);
      fcRequireDir(newParentDoc);
      fcRequireNotChild(newParentDoc, newName);
      await fcSendRename(c, doc, newParentDoc, newName);
    },
    // no custom `copy` implementation
  }, {isCaseSensitive: true}));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.auth', async () => {
    await fcFailIfPersistentTokenSaved();
    const persistentTokenPrompted = await fcPromptAuth();
    if (persistentTokenPrompted) {
      await fcSavePersistentToken(persistentTokenPrompted);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.logout', async () => {
    await fcDeletePersistentToken();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.open_project', async () => {
    if (!await fcEnsureAuthInteractive()) return;
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
    if (!await fcEnsureAuthInteractive()) return;
    const projectInfo = await fcGetProjectInfoHowever();
    if (!projectInfo) return;
    const c = await fcOtGetReadyClient(projectInfo.id);
    await fcSendRequestJoin(c);
  }));

  const /** @type {{[projectId: string]: vscode.LogOutputChannel}} */ fcLogOutputChannels = {};

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.logs', async () => {
    if (!await fcEnsureAuthInteractive()) return;
    const projectInfo = await fcGetProjectInfoHowever();
    if (!projectInfo) return;
    if (!(projectInfo.id in fcLogOutputChannels)) {
      const logOutputChannel = vscode.window.createOutputChannel(`Glitch Logs (${projectInfo.name})`, {log: true});
      fcLogOutputChannels[projectInfo.id] = logOutputChannel;
    }
    await fcOtGetReadyClient(projectInfo.id);
    const logOutputChannel = fcLogOutputChannels[projectInfo.id];
    fcStreamLogs(projectInfo.id, logOutputChannel);
    logOutputChannel.show();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('wh0.fishcracker.term_command', async () => {
    if (!await fcEnsureAuthInteractive()) return;
    const projectInfo = await fcGetProjectInfoHowever();
    if (!projectInfo) return;
    await fcOtGetReadyClient(projectInfo.id);
    const terminal = vscode.window.createTerminal({
      name: `Glitch Terminal (${projectInfo.name})`,
      pty: await fcCreatePseudoterminal(projectInfo.id),
    });
    terminal.show();
  }));

  context.subscriptions.push(vscode.window.registerTerminalProfileProvider('wh0.fishcracker.term', {
    async provideTerminalProfile(token) {
      console.log('tpp provide terminal profile'); // %%%
      if (!await fcEnsureAuthInteractive()) return;
      const projectInfo = await fcGetProjectInfoHowever();
      if (!projectInfo) return null;
      await fcOtGetReadyClient(projectInfo.id);
      return new vscode.TerminalProfile({
        name: `Glitch Terminal (${projectInfo.name})`,
        pty: await fcCreatePseudoterminal(projectInfo.id),
      });
    },
  }));
};
