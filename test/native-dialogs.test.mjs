import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { patchNativeDialogMessages } from '../src/native-dialogs.mjs';

test('localizes protected-folder native alerts without weakening the rejection path', () => {
  const source = `function reject(){dialog.showMessageBox({type:"error",message:"This folder can't be added",detail:"That folder is a protected location (or the path is invalid) and can't be a trusted folder."});return null}`;
  const dialogs=[];
  const result=runInNewContext(`${patchNativeDialogMessages(source)};reject()`,{dialog:{showMessageBox:options=>dialogs.push(options)}});
  assert.equal(result,null);
  assert.equal(dialogs[0].type,'error');
  assert.equal(dialogs[0].message,'无法添加此文件夹');
  assert.equal(dialogs[0].detail,'此文件夹位于受保护的位置（或路径无效），不能设为受信任文件夹。');
});
