# Testing Procedure

## Standard Dev Branch Testing Workflow

### 1. Commit & Push to Dev
```bash
cd ~/amplify-vite-react-template
git add <files>
git commit -m "feat: <description>"
git push origin dev
```

### 2. Monitor Amplify Build
After pushing to `dev`:
- **Go to:** https://us-east-1.console.aws.amazon.com/amplify/apps
- **Select App:** Look for `amplify-vite-react-template` or the dev app ID
  - **Dev App ID:** `d1dfxp3jics5eo`
- **Navigate to:** Deployments tab
- **Watch for:** 
  - Build status (usually 5-10 minutes)
  - Green checkmark = success
  - Red X = failure (check logs)

### 3. Browse the Dev Environment
Once build succeeds:
- **Dev URL:** `https://dev.amplifyapp.com` (or check Amplify console for exact URL)
- **Prod URL:** `https://barista.app` (or check Amplify console for exact URL)

### 4. Test Feature
- Navigate to the dev URL
- Test the new feature in the environment
- Check browser console for errors
- Test on multiple screen sizes if UI changes

### 5. Review & Merge to Main (if successful)
If testing passes:
```bash
git checkout main
git pull origin main
git merge dev
git push origin main
# Monitor prod build (same process, different app)
```

## AWS Amplify Console Access
- **Account:** old-money (AWS Partner)
- **Region:** us-east-1
- **Apps:**
  - Dev: `d1dfxp3jics5eo`
  - Prod: `d3vlwjr0og912h`

## Troubleshooting Build Failures
1. **Check build logs** in Amplify console
2. **Common issues:**
   - TypeScript errors
   - Missing imports
   - Amplify schema mismatches
   - Env var issues
3. **Fix locally, commit, push to dev again**
