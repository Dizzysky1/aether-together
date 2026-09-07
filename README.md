# Aether Together

A small GitHub Pages watch room. Create a room, open Aether in another tab, choose Share Aether tab (with tab audio), then copy the invite. Guests click Join room and Enable sound if needed. The host controls playback in the original tab. Keep both tabs open.

This shares a live view of the host's tab, including navigation, seeking, and subtitles. It does not remotely control Aether or synchronize independent players. There is streaming delay; guests may have different delays. No media is recorded or stored by this app. Share only content you have permission to share. Protected video may appear black; the app does not bypass content protection.

## GitHub Pages

Upload these files to the main branch of your repository, including `.github/workflows/pages.yml`. Under Settings → Pages choose GitHub Actions as the source. Run the Deploy watch room workflow, or push a commit. Use the deployed HTTPS URL; room invites also work under repository subpaths.

## Requirements and limits

- Host on desktop Chrome/Edge with screen capture support. Select the actual tab and enable tab audio. Audio support depends on browser and operating system.
- Up to four guests; host upload bandwidth increases with each guest.
- PeerJS 1.5.5 is vendored. Its public PeerServer handles signaling. WebRTC carries media directly where connectivity permits. There is no configured TURN relay, so restrictive NATs/firewalls may prevent connections. Production use should add a reliable signaling service and authenticated TURN service (short-lived credentials, never committed secrets).
- Anyone holding the unguessable invite can join while the room is open. Treat invites as private. Leave/recreate to rotate the room. Host refresh ends the room; guests can leave/rejoin after temporary disconnects.
- Guests share no microphone or camera. Guest input cannot control the host's browser. No server-side room history or recording.

## Validation

JavaScript syntax and local asset references checked during creation. A real two-device playback/audio test is still required after deployment; screen capture requires an interactive browser permission prompt.

## Dependency

PeerJS: https://github.com/peers/peerjs (MIT). See vendor/LICENSE.peerjs.
