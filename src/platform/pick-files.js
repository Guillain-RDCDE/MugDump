/** Multi-select file picker (works identically in the browser and in Electron). */
export const SAVE_FILE_ACCEPT = '.sav,.SAV,.srm,.SRM,.sta,.STA';

export function pickSaveFiles() {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      multiple: true,
      accept: SAVE_FILE_ACCEPT,
    });
    input.onchange = () => resolve(Array.from(input.files || []));
    input.click();
  });
}
