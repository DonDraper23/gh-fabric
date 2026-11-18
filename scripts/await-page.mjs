import {setTimeout as delay} from 'node:timers/promises';
import {readPages} from './cms.mjs';

const id = Number(process.env.EDITED_PAGE_ID);
const modified = process.env.EDITED_PAGE_TIME || '';
if (Number.isSafeInteger(id) && id > 0 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(modified)) {
  let ready = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const page = (await readPages()).find(item => item.id === id);
    if (page && page.modified_gmt >= modified) {
      ready = true;
      break;
    }
    if (attempt !== 9) await delay(6000);
  }
  if (!ready) throw new Error('The WordPress publication index has not exposed this update yet');
}
