import '@backstage/cli/asset-types';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@backstage/ui/css/styles.css';
import { ScalprumRoot } from './components/DynamicRoot';

// Entry point. ScalprumRoot wraps App with the dynamic-plugin runtime
// bootstrap, which is a transparent pass-through when no dynamic plugins
// are configured (chart 0.5.0 default state). See ScalprumRoot.tsx for
// the additive-transparency contract.
//
// Boot sequence change vs chart 0.4.0:
//   0.4.0: render <App/> immediately (sync)
//   0.5.0: ScalprumRoot fetches /api/dynamic-plugins/manifest, then
//          renders <App/> (manifest empty -> pass-through verbatim;
//          manifest non-empty -> Phase 5 loader populates context).
//
// What this does NOT touch:
//   - The backend's config-schema load (createConfigSecretEnumerator).
//     That runs on the BACKEND at boot, finishes before the HTML
//     response ships, and is completely upstream of ScalprumRoot.
//   - Backstage's app.createRoot discovery walker. createRoot runs
//     synchronously when App is imported on the line above; the walker
//     has indexed all routable extensions by the time React first
//     renders. ScalprumRoot wraps the result, it doesn't re-enter the
//     createApp pipeline.
ReactDOM.createRoot(document.getElementById('root')!).render(
	<ScalprumRoot>
		<App />
	</ScalprumRoot>,
);
