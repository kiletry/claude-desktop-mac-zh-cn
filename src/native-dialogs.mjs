const NATIVE_DIALOG_TRANSLATIONS = {
  "This folder can't be added": '无法添加此文件夹',
  "That folder is a protected location (or the path is invalid) and can't be a trusted folder.": '此文件夹位于受保护的位置（或路径无效），不能设为受信任文件夹。',
  "That folder is Claude's internal storage and can't be a trusted folder.": '此文件夹是 Claude 的内部存储目录，不能设为受信任文件夹。',
  'Only folders can be trusted. Choose a folder instead of a file.': '只能将文件夹设为受信任位置。请选择文件夹，而不是文件。',
};

// These messages are hardcoded in the native process, outside the i18n catalogs.
export function patchNativeDialogMessages(source) {
  for (const [from, to] of Object.entries(NATIVE_DIALOG_TRANSLATIONS)) {
    source = source.replaceAll(JSON.stringify(from), JSON.stringify(to));
  }
  return source;
}
