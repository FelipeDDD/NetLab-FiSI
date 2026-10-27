import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Uses the existing disposable-browser runner and production terminal views.
// No normal boot, real database, user profile or external clipboard access.
export async function runTerminalEditing({ page, url, root, report }) {
  const database = 'netlab-idb-test-' + crypto.randomUUID();
  const directory = path.join(root, '.playwright-mcp/reviews/raw/terminal-editing');
  await mkdir(directory, { recursive: true });
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async expression => {
    for (let i = 0; i < 200; i++) {
      if (await page.evaluate(`return !!(${expression});`)) return;
      await delay(30);
    }
    throw Error('Terminal editing condition: ' + expression);
  };
  const test = async (name, run) => {
    try { await run(); report.results['terminal editor: ' + name] = { passed: true }; }
    catch (error) { report.results['terminal editor: ' + name] = { passed: false, error: error.stack }; throw error; }
  };
  const settle = async () => { await delay(25); await page.evaluate('await new Promise(resolve=>session.term.write("",resolve));'); };
  const focus = async id => {
    await page.evaluate(`store.getState().openTerminal(${JSON.stringify(id)});window.session=terminals.getSession(sim.net.devices.get(${JSON.stringify(id)}));`);
    await wait('session.term.element?.isConnected');
    await delay(80);
    await page.evaluate('session.term.focus();');
    await wait('document.activeElement===session.term.textarea');
    await settle();
  };
  const keys = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Home: 36, End: 35, Backspace: 8, Delete: 46, Enter: 13, c: 67, a: 65 };
  const key = async (name, modifiers = 0) => {
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name.length === 1 ? 'Key' + name.toUpperCase() : name, windowsVirtualKeyCode: keys[name], modifiers, ...(name === 'Enter' ? { text: '\r' } : {}) });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: keys[name], modifiers });
    await settle();
  };
  const type = async text => { await page.send('Input.insertText', { text }); await settle(); };
  const paste = async text => { await page.evaluate(`session.term.paste(${JSON.stringify(text)});`); await settle(); };
  const snapshot = () => page.evaluate(`const b=session.term.buffer.active;const start=(await import('/src/terminalLine.ts')).inputStartRow(b);const row=b.baseY+b.cursorY;let end=row;while(end+1<b.length&&b.getLine(end+1)?.isWrapped)end++;
    const rows=Array.from({length:end-start+1},(_,i)=>b.getLine(start+i)?.translateToString(false)??'');
    const prefix=Array.from({length:row-start+1},(_,i)=>b.getLine(start+i)?.translateToString(false,0,start+i===row?b.cursorX:session.term.cols)??'').join('');
    return {line:rows.join('').trimEnd(),prefix,cols:session.term.cols,rows:session.term.rows,cursorX:b.cursorX,cursorY:b.cursorY,start,baseY:b.baseY};`);
  const check = async (text, cursor = text.length) => {
    const actual = await snapshot();
    const prompt = await page.evaluate(`const d=sim.net.devices.get(store.getState().activeTerminal);return d.os==='windows'?${JSON.stringify('C:\\>')}:d.name+':~$ ';`);
    assert.equal(actual.line, (prompt + text).trimEnd(), JSON.stringify(actual));
    assert.equal(actual.prefix, prompt + text.slice(0, cursor), JSON.stringify(actual));
  };
  const submitted = () => page.evaluate('return executions.at(-1);');
  const image = async name => { const shot = await page.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(directory, name), Buffer.from(shot.data, 'base64')); };
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });
    await page.send('Page.navigate', { url });
    await wait("document.readyState==='complete'&&document.getElementById('root')");
    await page.evaluate(`await import('/node_modules/@xyflow/react/dist/style.css');await import('/node_modules/@xterm/xterm/css/xterm.css');await import('/src/themes.css');await import('/src/styles.css');await import('/src/buttons.css');
      window.store=(await import('/src/store.ts')).useStore;window.sim=(await import('/src/sim.ts')).sim;window.terminals=await import('/src/terminals.ts');
      const fixtures=await import('/src/testing/interfaceAuditFixture.ts');const entry=await import('/src/workspace/WorkspaceApplication.tsx');
      window.application=entry.mountWorkspaceApplication(document.getElementById('root'),{repositoryOptions:{databaseName:${JSON.stringify(database)}},legacy:{storage:{getItem:key=>key==='netsim:autosave:v1'?JSON.stringify(fixtures.interfaceAuditDocument()):null},origin:'https://terminal-test.invalid'}});await application.ready;
      window.executions=[];const {Shell}=await import('/src/commands/shell.ts');const original=Shell.prototype.exec;Shell.prototype.exec=function(line,...args){executions.push({id:this.device.id,line});return original.call(this,line,...args);};
      store.getState().setHostOs('pc2','windows');store.getState().openTerminal('pc1');store.getState().openTerminal('pc2');`);
    await wait("application.controller?.getState().phase==='ready'");
    const paused = await page.evaluate('return {paused:store.getState().paused,clock:sim.net.now};');
    for (const [os, id, theme] of [['Linux', 'pc1', 'graphite-dark'], ['Windows', 'pc2', 'classic-light']]) {
      await page.evaluate(`(await import('/src/uiTheme.ts')).useUiTheme.getState().setTheme(${JSON.stringify(theme)});`);
      await focus(id);
      await test(os + ': insertion at start/middle/end, prompt boundaries and execution from the middle', async () => {
        await type('hname');await key('Home');await key('ArrowLeft');await key('Backspace');await check('hname',0);
        await key('ArrowRight');await type('ost');await check('hostname',4);
        await key('End');await key('ArrowRight');await key('Delete');await check('hostname');
        await key('Home');await key('Enter');assert.deepEqual(await submitted(),{id,line:'hostname'});
        await type('xxhostname');await key('Home');await key('Delete');await key('ArrowRight');await key('Backspace');await check('hostname',0);
        await key('End');await type('X');await key('Backspace');await key('Enter');assert.deepEqual(await submitted(),{id,line:'hostname'});
      });
      await test(os + ': history restores the partial draft and its cursor', async () => {
        await type('hostme');await key('ArrowLeft');await key('ArrowLeft');
        await key('ArrowUp');await check('hostname');await key('ArrowUp');await key('ArrowDown');await key('ArrowDown');await key('ArrowDown');await check('hostme',4);
        await type('na');await key('Enter');assert.deepEqual(await submitted(),{id,line:'hostname'});
      });
      await test(os + ': Unicode, normalized paste in the middle and select/replace', async () => {
        await paste('a🌐e\u0301東z');await key('ArrowLeft');await key('ArrowLeft');await key('Backspace');
        await paste('Grüße\r\n');await key('Delete');await check('a🌐Grüße z','a🌐Grüße '.length);
        await key('Home');await key('a',2);await paste('hostname');await check('hostname');await key('Enter');assert.deepEqual(await submitted(),{id,line:'hostname'});
      });
      await test(os + ': wrapped line editing, right margin and resize retain buffer/cursor', async () => {
        const cols=await page.evaluate('return session.term.cols;');
        const text='unknown_'+ 'a'.repeat(cols*2+7);
        await type(text);await key('Home');await key('ArrowRight');await type('Z');await check('uZnknown_'+ 'a'.repeat(cols*2+7),2);
        await key('End');await key('ArrowLeft');await key('Backspace');
        const edited='uZnknown_'+ 'a'.repeat(cols*2+6);await check(edited,edited.length-1);
        await page.send('Emulation.setDeviceMetricsOverride',{width:1000,height:960,deviceScaleFactor:1,mobile:false});await delay(200);await settle();await check(edited,edited.length-1);
        await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await delay(200);await settle();await check(edited,edited.length-1);
        await key('Home');
        await page.send('Emulation.setDeviceMetricsOverride',{width:1000,height:960,deviceScaleFactor:1,mobile:false});await delay(200);await settle();await check(edited,0);
        await page.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await delay(200);await settle();await check(edited,0);await key('End');await key('ArrowLeft');
        await image(os.toLowerCase()+'-wrapped.png');await key('Enter');assert.deepEqual(await submitted(),{id,line:edited});
        const promptLength=os==='Windows'?4:await page.evaluate("return sim.net.devices.get('pc1').name.length+4;");
        const atMargin='x'.repeat((await page.evaluate('return session.term.cols;'))-promptLength);
        await type(atMargin);await key('ArrowLeft');await type('Q');await key('Delete');await check(atMargin.slice(0,-1)+'Q');await key('c',2);
      });
      await test(os + ': wide Unicode at a wrap boundary and font reflow keep graphemes intact', async () => {
        const cols=await page.evaluate('return session.term.cols;');
        const promptLength=os==='Windows'?4:await page.evaluate("return sim.net.devices.get('pc1').name.length+4;");
        const text='x'.repeat(cols-promptLength-1)+'東e\u0301🌐z';
        await paste(text);await key('ArrowLeft');await key('ArrowLeft');await key('ArrowLeft');await key('ArrowLeft');
        assert.equal((await snapshot()).cursorX,0);
        await type('Q');await key('Delete');
        await page.evaluate('window.oldFont=store.getState().terminalAppearance.fontSize;store.getState().setTerminalAppearance({fontSize:oldFont+2});');await delay(150);await settle();
        await page.evaluate('store.getState().setTerminalAppearance({fontSize:oldFont});');await delay(150);await settle();
        await key('End');await key('Backspace');await key('Backspace');await key('Enter');
        assert.deepEqual(await submitted(),{id,line:'x'.repeat(cols-promptLength-1)+'Qe\u0301'});
        await check('');
      });
    }
    await test('multiple terminals and column movement keep independent input/cursors and xterm sessions',async()=>{
      await focus('pc1');await type('hostme');await key('ArrowLeft');await key('ArrowLeft');
      await page.evaluate('window.firstSession=session;');
      await focus('pc2');await type('hostnameX');await key('ArrowLeft');await check('hostnameX',8);
      await page.evaluate("const p=store.getState().terminalPanels;store.getState().moveTerminalTab('pc1',{panelId:p.find(n=>n.tabs.includes('pc2')).id,beforeId:'pc2'});");
      await focus('pc1');assert(await page.evaluate('return session===firstSession;'));await check('hostme',4);await type('na');await key('Enter');assert.deepEqual(await submitted(),{id:'pc1',line:'hostname'});
      await focus('pc2');await check('hostnameX',8);await key('Delete');await key('Enter');assert.deepEqual(await submitted(),{id:'pc2',line:'hostname'});
    });
    await test('idle edits never start Run; running output, Ctrl+C and input gating remain intact',async()=>{
      assert.deepEqual(await page.evaluate('return {paused:store.getState().paused,clock:sim.net.now};'),paused);
      for(const [id,line] of [['pc1','ping 192.0.2.1'],['pc2','ping -t 192.0.2.1']]){
        await focus(id);await type(line);await key('Enter');
        const count=await page.evaluate('return executions.length;');
        await key('ArrowLeft');await key('Home');await key('Backspace');await key('ArrowUp');await paste('hostname\r');await type('bad');
        assert.equal(await page.evaluate('return executions.length;'),count);
        await page.evaluate('sim.net.scheduler.advanceTo(sim.net.now+1200);');await settle();await key('c',2);
        await type('hostname');await key('Enter');assert.deepEqual(await submitted(),{id,line:'hostname'});
      }
    });
  } finally {
    await page.evaluate(`application?.dispose();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(${JSON.stringify(database)});r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('terminal test database blocked'));});`);
  }
}
