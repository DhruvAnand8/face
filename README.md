# FacePass Website

This repo hosts a static HTML website for the FacePass biometric login demo.

## Local preview in VS Code

1. Open the folder `/Users/admin/AWS` in VS Code.
2. Install the `Live Server` extension if you do not already have it.
3. Open `index.html`.
4. Right-click the file and choose `Open with Live Server`.

## GitHub Pages deployment

1. Create a GitHub repo.
2. Add the repo remote and push the project:

```bash
git remote add origin https://github.com/USERNAME/REPO.git
git branch -M main
git push -u origin main
```

3. On GitHub, go to `Settings` → `Pages`.
4. Set the source branch to `main` and the folder to `/ (root)`.
5. Save and wait a few minutes for the published URL.

## Notes

- The page uses the browser camera and must be opened over HTTPS for full camera support.
- GitHub Pages will serve the static file automatically once the repo is published.
