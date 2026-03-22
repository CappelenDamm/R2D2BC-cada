import { createApp } from "vue";
import ReaderComponent from "./ReaderComponent.vue";
import readiumBefore from "url:../react/readium-css/ReadiumCSS-before.css";
import readiumAfter from "url:../react/readium-css/ReadiumCSS-after.css";
import readiumDefault from "url:../react/readium-css/ReadiumCSS-default.css";

const app = createApp(ReaderComponent, {
  injectables: [
    { type: "style", url: readiumBefore, r2before: true },
    { type: "style", url: readiumDefault, r2default: true },
    { type: "style", url: readiumAfter, r2after: true },
  ],
});
app.mount("#app");
