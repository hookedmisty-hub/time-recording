# GitHub Pages deployment

Repository: https://github.com/hookedmisty-hub/time-recording
Website: https://hookedmisty-hub.github.io/time-recording/

This is an independent project site. Do not change the personal homepage repository or add a link to its homepage.

1. Push this project source to the main branch of the time-recording repository.
2. In repository Settings > Pages > Build and deployment, choose GitHub Actions.
3. Run the Deploy time recording to Pages workflow if needed.
4. Check the completed deployment and open the website URL above.

The workflow builds and uploads only dist/. Personal JSON backups, node_modules/, and the previous installation package are excluded from Git.

Local development: npm install, then npm run dev (http://localhost:5173/).
Build: npm run build. Preview: npm run preview (http://localhost:4173/).

Records remain in browser localStorage. Export JSON from localhost and import it into the published website to migrate records. There is no server-side data storage or device synchronization.
