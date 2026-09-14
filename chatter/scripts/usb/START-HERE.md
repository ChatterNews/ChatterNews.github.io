# Orbit USB pilot

The app, fonts, instruments, and speech/image model files live in `app/` on
this drive. The launcher reads them from here. It does not install Orbit or
upload student projects. Python 3.9+ runs the launcher on the computer.

## First Chromebook check — teacher setup

This kit requires school-permitted Linux development environment, Python 3.9+
and USB access. It has NOT been verified on your managed Chromebooks. If Linux
is missing or blocked, stop: school IT must provide a permitted local runtime
before this kit can run. Do not use developer mode or disable browser security.

1. In Chromebook Files, right-click the drive and choose **Share with Linux**.
2. Open Terminal. Type `python3 ` (with a space), then the full path to this
   kit's `launch-orbit.py`. For a drive named ORBIT, for example:

   ```sh
   python3 "/mnt/chromeos/removable/ORBIT/Orbit-USB/launch-orbit.py"
   ```

   Replace the drive and folder names with the actual ones. Keep the whole kit
   together. Running the script through Python works without making the USB executable.
3. Keep Terminal open and open **http://localhost:8765** in the main ChromeOS
   Chrome browser. Always use this exact address and port for the same browser
   recovery copy. No LAN port-forwarding or internet host is needed.
4. Allow the microphone/camera when needed. Try Studio playback, recording,
   duplicate MIDI clips, and a mix export. Test speech transcription and an
   image import with Wi-Fi off. A successful launcher alone is not this test.

The loopback server serves only `app/`, never `Student-work/` or the drive root.
Do not put student work inside `app/`.

## Each session

1. Start the launcher and open Orbit. Check in with the correct badge.
2. Use **Story Drive → Choose .chatter file** to open the latest collected story.
   A session folder can contain several story files; open the ones needed.
3. Work normally. Browser autosave is a recovery copy on this Chromebook;
   it is not a live write to the USB.
4. Use **Story Drive → Finish session** and choose this USB's `Student-work`
   folder. It saves every story on the local desk in a new dated session folder.
   Link standalone projects/outputs to stories first. Do not mix several
   students' desks in one browser profile without checking the story list.
5. Wait for **Session packed**. Orbit reads back and checks the saved files.
   The folder contains one editable `.chatter` per story and `SESSION-COMPLETE.json`.
   If it fails, keep Orbit open and retry; an incomplete attempt can remain until
   another attempt succeeds. Do not collect a failed attempt as a finished session.
6. Close Orbit, press **Ctrl+C** in Terminal, then eject the drive in Files.
   Further edits after packing require another save. Never unplug a running kit.

The teacher can open each collected `.chatter` in Orbit on another computer,
edit it, and export/post the final media. Finish session does not publish anything.
Use one editor per story at a time; this is not concurrent collaboration.

## Two-computer pilot acceptance

On two actual school devices: open the app from USB; switch Wi-Fi off; record and
edit in the rooms being used; finish the session; eject; reopen every story on
the second computer. Check the editable Studio notes and clips, audio sources,
layouts, video cuts, podcast edits, writing, and final exports. Also cancel a
picker and test a full/disconnected drive using disposable work. Verify that a
failure cannot produce a successful handoff message. Imported media still goes
through Orbit's existing review process.

Device policy, USB speed, available RAM, microphone/camera access, and the real
physical USB round trip remain pilot checks. No student data is cleared by this kit.
