import fs from 'fs';
import path from 'path';

function setWindowsSubsystem(exePath) {
  const buffer = fs.readFileSync(exePath);
  
  // DOS Header starts at 0. At offset 0x3C is a 4-byte pointer to the PE header.
  const peOffset = buffer.readUInt32LE(0x3C);
  
  // PE header starts with 'PE\0\0' (4 bytes)
  if (buffer.readUInt32LE(peOffset) !== 0x00004550) {
    throw new Error('Not a valid PE file');
  }

  // The Optional Header starts right after the COFF header (which is 20 bytes long).
  // So Optional Header is at peOffset + 4 + 20 = peOffset + 24.
  // In the Optional Header, the Subsystem field is a 2-byte integer.
  // For PE32 (32-bit), Subsystem is at Optional Header + 68 bytes.
  // For PE32+ (64-bit), Subsystem is at Optional Header + 68 bytes.
  
  // Let's check magic number to determine PE32 or PE32+
  const magic = buffer.readUInt16LE(peOffset + 24);
  let subsystemOffset = 0;
  if (magic === 0x10b) {
    // PE32
    subsystemOffset = peOffset + 24 + 68;
  } else if (magic === 0x20b) {
    // PE32+
    subsystemOffset = peOffset + 24 + 68;
  } else {
    throw new Error(`Unknown PE magic: ${magic.toString(16)}`);
  }

  const currentSubsystem = buffer.readUInt16LE(subsystemOffset);
  console.log(`Current Subsystem: ${currentSubsystem}`);
  
  // 3 = IMAGE_SUBSYSTEM_WINDOWS_CUI (Console)
  // 2 = IMAGE_SUBSYSTEM_WINDOWS_GUI (Windows GUI)
  if (currentSubsystem === 3) {
    buffer.writeUInt16LE(2, subsystemOffset);
    fs.writeFileSync(exePath + '.gui.exe', buffer);
    console.log('Subsystem changed to 2 (GUI). Saved as .gui.exe');
  } else {
    console.log('Subsystem is already not Console (3)');
  }
}

const caxaStub = path.join(process.cwd(), 'node_modules', 'caxa', 'stubs', 'stub--win32--x64');
setWindowsSubsystem(caxaStub);
