import enContent from './en/content';
import enUi from './en/ui';
import zhCNContent from './zh-CN/content';
import zhCNUi from './zh-CN/ui';
import zhTWContent from './zh-TW/content';
import zhTWUi from './zh-TW/ui';
import msContent from './ms/content';
import msUi from './ms/ui';
import taContent from './ta/content';
import taUi from './ta/ui';
import hiContent from './hi/content';
import hiUi from './hi/ui';

/**
 * One flat catalog per locale. Keys are the English source strings used in the
 * components (`t('Play')`), which keeps lookups greppable and means a missing
 * translation falls back to readable English instead of a placeholder key.
 *
 * `content.js` holds long-form copy (bot banter, lesson text); `ui.js` holds
 * interface strings. Adding a locale means adding those two files and one entry
 * here plus `SUPPORTED_LOCALES` in `../locales.js`.
 */
export const CATALOGS = {
  en: { ...enContent, ...enUi },
  'zh-CN': { ...zhCNContent, ...zhCNUi },
  'zh-TW': { ...zhTWContent, ...zhTWUi },
  ms: { ...msContent, ...msUi },
  ta: { ...taContent, ...taUi },
  hi: { ...hiContent, ...hiUi },
};

export default CATALOGS;