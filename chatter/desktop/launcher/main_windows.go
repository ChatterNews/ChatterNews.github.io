//go:build windows

// Start Orbit only opens the adjacent bundled runtime. It never forwards command
// line arguments or invokes a shell, and it does not open a listening port.
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	messageBoxW = user32.NewProc("MessageBoxW")
	kernel32    = syscall.NewLazyDLL("kernel32.dll")
	getAttrsW   = kernel32.NewProc("GetFileAttributesW")
	setAttrsW   = kernel32.NewProc("SetFileAttributesW")
)

func fail(message string) {
	title, _ := syscall.UTF16PtrFromString("Orbit could not open")
	text, _ := syscall.UTF16PtrFromString(message)
	messageBoxW.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 0x10)
	os.Exit(1)
}

func main() {
	executable, err := os.Executable()
	if err != nil {
		fail("Orbit could not locate its folder. Download the ZIP, choose Extract All, then open Start Orbit inside the extracted folder.")
	}
	root := filepath.Dir(executable)
	runtime := filepath.Join(root, "_Orbit", "runtime", "Orbit.exe")
	for _, name := range []string{
		runtime,
		filepath.Join(root, "_Orbit", "runtime", "resources", "app", "main.cjs"),
		filepath.Join(root, "_Orbit", "runtime", "resources", "app", "web", "index.html"),
	} {
		info, err := os.Stat(name)
		if err != nil || info.IsDir() {
			fail("Orbit's supporting files are missing.\n\nDownload the whole ZIP from Google Drive, choose Extract All, then open Start Orbit inside the extracted Orbit folder. Keep Start Orbit beside the _Orbit folder.")
		}
	}
	if err := os.MkdirAll(filepath.Join(root, "Chatter News"), 0755); err != nil {
		fail("Orbit could not open the Chatter News folder for student work. Move the extracted Orbit folder to a writable location or reconnect the USB drive, then try again.\n\n" + err.Error())
	}
	// Mark only Orbit's own support directory as hidden. Do not change the
	// user's Explorer preferences or the visibility of their student work.
	if support, err := syscall.UTF16PtrFromString(filepath.Join(root, "_Orbit")); err == nil {
		attributes, _, _ := getAttrsW.Call(uintptr(unsafe.Pointer(support)))
		if uint32(attributes) != 0xffffffff {
			setAttrsW.Call(uintptr(unsafe.Pointer(support)), attributes|0x2)
		}
	}
	command := exec.Command(runtime)
	command.Dir = filepath.Dir(runtime)
	for _, entry := range os.Environ() {
		key := strings.ToUpper(strings.SplitN(entry, "=", 2)[0])
		// Avoid inherited Electron developer switches and always derive the
		// portable folder from this launcher, including paths with spaces.
		if key != "ORBIT_PORTABLE_ROOT" && !strings.HasPrefix(key, "ELECTRON_") && key != "NODE_OPTIONS" {
			command.Env = append(command.Env, entry)
		}
	}
	command.Env = append(command.Env, "ORBIT_PORTABLE_ROOT="+root)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := command.Start(); err != nil {
		fail("Windows could not start Orbit. Keep all of the extracted files together and check that this is a 64-bit Windows 10 or Windows 11 PC.\n\n" + err.Error())
	}
	// Orbit owns its lifetime. Closing the small launcher must not close the app.
	_ = command.Process.Release()
}
