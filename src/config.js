// The few things you will want to customize.
// Tip: `npm run set-donate -- YOUR_BMC_NAME --repo YOUR_GITHUB_USER/LocalMusicAndVideo` rewrites the donation link and repo link everywhere at once.
import { version } from "../package.json";

export const APP_NAME = "LocalMusic and Video";
export const AUTHOR = "CrispySoft";
export const VERSION = version;
// Your Buy Me a Coffee page is  https://www.buymeacoffee.com/<BMC_USERNAME>.  While this still says YOUR_..., no donate button is shown.
export const BMC_USERNAME = "favianrajed";
export const DONATE_URL = /^YOUR_/.test(BMC_USERNAME) ? "" : `https://www.buymeacoffee.com/${BMC_USERNAME}`;
export const REPO_URL = "https://github.com/FavianRajendra/LocalMusic-Video";
