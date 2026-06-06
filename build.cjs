const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const pngToIco = require('png-to-ico').default || require('png-to-ico');
const rcedit = require('rcedit').rcedit || require('rcedit');

async function build() {
  console.log('Starting optimized build...');
  
  const tmpDir = path.join(__dirname, '.tmp-build');
  const buildDir = path.join(__dirname, 'build');
  const exePath = path.join(buildDir, 'LOL-Skin-Library-App.exe');
  
  // 1. Clean previous build dirs
  if (fs.existsSync(tmpDir)) fs.removeSync(tmpDir);
  if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir);

  // 2. Prepare tmp directory with ONLY necessary files
  console.log('Copying source files...');
  fs.copySync(path.join(__dirname, 'public'), path.join(tmpDir, 'public'));
  fs.copySync(path.join(__dirname, 'server.js'), path.join(tmpDir, 'server.js'));
  
  // Copy package.json but remove devDependencies to save space
  const pkg = require('./package.json');
  const prodPkg = { ...pkg };
  delete prodPkg.devDependencies;
  delete prodPkg.scripts;
  fs.writeJsonSync(path.join(tmpDir, 'package.json'), prodPkg, { spaces: 2 });

  // 3. Install prod dependencies in tmp
  console.log('Installing production dependencies (this saves a lot of space)...');
  execSync('npm install --omit=dev', { cwd: tmpDir, stdio: 'inherit' });

  // 4. Generate Icon and Edit Stub
  console.log('Generating Icon...');
  const Jimp = require('jimp');
  const pngPath = path.join(__dirname, 'icon.png');
  const squarePngPath = path.join(buildDir, 'temp-square.png');
  const icoPath = path.join(buildDir, 'icon.ico');
  const customStubPath = path.join(buildDir, 'custom-stub.exe');
  
  try {
    // Read and resize to square
    const image = await Jimp.read(pngPath);
    await image.resize(256, 256).writeAsync(squarePngPath);

    const buf = await pngToIco(squarePngPath);
    fs.writeFileSync(icoPath, buf);
    fs.removeSync(squarePngPath); // clean up the temp square png
    
    // Copy caxa stub to apply icon BEFORE bundling (so rcedit doesn't truncate the caxa payload)
    const caxaStub = path.join(__dirname, 'node_modules', 'caxa', 'stubs', 'stub--win32--x64');
    fs.copyFileSync(caxaStub, customStubPath);
    
    console.log('Applying Icon to Stub...');
    await rcedit(customStubPath, {
      icon: icoPath,
      'file-version': '1.0.0',
      'product-version': '1.0.0',
      'version-string': {
        CompanyName: 'LOL Skin Library',
        FileDescription: 'LOL Skin & Profile Viewer',
        ProductName: 'LOL Skin Library',
        OriginalFilename: 'LOL-Skin-Library.exe'
      }
    });
    
    // rcedit rebuilds the PE file and strips any trailing non-PE data
    // We MUST re-append the caxa separator so the stub can find the payload!
    fs.appendFileSync(customStubPath, '\nCAXACAXACAXA\n');
    console.log('Icon applied to stub successfully!');
  } catch (err) {
    console.error('Failed to apply icon to stub:', err);
  }

  // 5. Run caxa on the tmp directory using the custom stub
  console.log('Packaging executable with caxa...');
  // Check if we need to kill previous exe
  try {
    execSync('taskkill /F /IM "LOL-Skin-Library-App.exe" /T', { stdio: 'ignore' });
  } catch(e) {}
  
  const stubFlag = fs.existsSync(customStubPath) ? `--stub "${customStubPath}"` : '';
  execSync(`npx caxa -i "${tmpDir}" -o "${exePath}" ${stubFlag} -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/server.js"`, { stdio: 'inherit' });

  // 6. Cleanup
  console.log('Cleaning up temporary files...');
  fs.removeSync(tmpDir);
  
  console.log('====================================');
  console.log('Build Complete! Saved to:', exePath);
  console.log('====================================');
}

build().catch(console.error);
