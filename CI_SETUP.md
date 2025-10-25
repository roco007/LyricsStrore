# CI/CD Pipeline Setup Guide

This guide will help you set up automatic EAS builds whenever you push code to specific branches.

## 🚀 What This Pipeline Does

- **Triggers**: Automatically runs when you push to `rc_007`, `main`, or `prod` branches
- **Builds**: Creates Android APK using `eas build -p android --profile preview`
- **Platforms**: Currently configured for Android builds
- **Artifacts**: Build artifacts are automatically uploaded and available for download

## 🔧 Setup Instructions

### 1. Get Your Expo Token

First, you need to generate an Expo access token:

```bash
# Login to EAS (if not already logged in)
eas login

# Generate a new token
eas auth:token
```

Copy the generated token - you'll need it for the next step.

### 2. Configure GitHub Secrets

1. Go to your GitHub repository: `https://github.com/roco007/LyricsStrore`
2. Click on **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add the following secret:
   - **Name**: `EXPO_TOKEN`
   - **Value**: Paste the token you generated in step 1

### 3. Customize Branch Triggers (Optional)

If you want to change which branches trigger the build, edit `.github/workflows/auto-build.yml`:

```yaml
on:
  push:
    branches:
      - your-branch-name  # Add or change branch names here
      - main
      - prod
```

### 4. Test the Pipeline

1. Make a small change to your code
2. Commit and push to the `rc_007` branch:
   ```bash
   git add .
   git commit -m "Test CI pipeline"
   git push origin rc_007
   ```
3. Go to the **Actions** tab in your GitHub repository
4. You should see the workflow running

## 📱 Build Profiles

The pipeline uses the `preview` profile from your `eas.json`. You can modify this by changing the command in the workflow:

```yaml
run: eas build -p android --profile production --non-interactive
```

## 🔍 Monitoring Builds

- **GitHub Actions**: Check the Actions tab in your repository
- **EAS Dashboard**: Visit https://expo.dev/accounts/rc_007/projects/LyricsStore/builds
- **Build Artifacts**: Download APK files from the Actions tab after successful builds

## 🛠️ Troubleshooting

### Common Issues:

1. **"EXPO_TOKEN not found"**
   - Make sure you've added the `EXPO_TOKEN` secret in GitHub
   - Verify the token is valid by running `eas whoami` locally

2. **"Build failed"**
   - Check the build logs in the EAS dashboard
   - Ensure your `eas.json` configuration is correct
   - Verify all dependencies are properly installed

3. **"Workflow not triggering"**
   - Check that you're pushing to the correct branch
   - Verify the workflow file is in `.github/workflows/`
   - Check the Actions tab for any syntax errors

### Getting Help:

- Check the [EAS Build documentation](https://docs.expo.dev/build/introduction/)
- Review [GitHub Actions documentation](https://docs.github.com/en/actions)
- Check the build logs in the EAS dashboard for detailed error messages

## 📋 Workflow Files

- `.github/workflows/auto-build.yml` - Main workflow for automatic builds
- `.github/workflows/eas-build.yml` - Extended workflow with iOS support

## 🎯 Next Steps

1. Set up the GitHub secret as described above
2. Push a test commit to trigger the build
3. Monitor the build progress in GitHub Actions
4. Download and test the generated APK

Your CI/CD pipeline is now ready! 🎉
