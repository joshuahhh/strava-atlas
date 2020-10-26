# must-have for user testing
[x] figure out why geolocate blocks mouse events
[x] reasonable initial view
[x] UI for settings
[x] deploying
[x] fix need for router; make sure loading from hashes works
[ ] privacy badger

# must-have for open-source launch
[?] figure out why clicking some routes doesn't zoom correctly
[x] beautiful favicon
[x] figure out HTTP vs HTTPS nonsense
[ ] write README.md
[x] unobstrusive load-new-activities
[ ] better source for strava font
* figure out how to incorporate vendor bug fixes:
  [x] pixi problem with paths (https://github.com/pixijs/pixi.js/pull/6928)
  [x] leaflet problem with removing doubles (https://github.com/Leaflet/Leaflet/pull/6522)
* fix up code
  [ ] in general lol
  [x] factor out secret keys
  [x] clean up package.json

# nice-to-have (high priority)
[x] nice clean build (without any 'watching')
[ ] "no map available" indicator
* table
  [ ] show icon for activity type
  [ ] sort & filter
  [ ] incremental search-by-name
[ ] detect & message rate limiting
[ ] store position in URL
[ ] map switcher support
[ ] think harder about welcome & loading screens
[ ] switch to eachActAlpha.blendMode = PIXI.BLEND_MODE.ADD, and a more principled color map

# nice-to-have (lower priority)
* table
  [ ] filter by map view
  [ ] map thumbnails
  [ ] elevation charts in the background
[ ] dedicated elevation chart viewer
  [ ] with statistics for selections
  [ ] with automatic segmentation into climbs & descents
[ ] higher-quality paths (load asynchronously?)
[ ] show start/stop, or directions? (on highlight, maybe)
[ ] arrow at edge of screen if highlighed object is off screen
[ ] browse activities using graph of distance vs elevation, etc.
[ ] fix low-key path wonkiness (repeated vertices? idk)
[ ] mobile viewability
[ ] timeline: slide window around and see where u was riding :D
[ ] bubble week view (like strava has)

# questions


POINT TO POINT!!!



# steps for onlineability:
1. no persistence! log in, it downloads & displays
2. persist activities, but require reload button with reauth
3. persist activities, but require reload button without reauth (use refresh token)
4. persist activities, automatically load new stuff