# Strava Atlas

A free third-party tool which draws all your activities onto a single explorable map.

<img src="https://github.com/joshuahhh/strava-atlas/blob/main/public/map.png?raw=true" width="400"/>

Hosted publicly at http://strava-atlas.herokuapp.com/, unless that starts causing trouble.

## Run it yourself

To run your own copy of Strava Atlas:

1. Clone this repository.

2. Register a <a href='https://www.strava.com/settings/api'>Strava API Application</a> to get a "Client ID" and "Client Secret". Put them in a file called `.env`, in the base of the repository. This file should look like:

    ```
    STRAVA_CLIENT_ID=12345
    STRAVA_CLIENT_SECRET=0123456789abcdef0123456789abcdef01234567
    ```

3. Run `yarn` to install dependencies.

4. Run `yarn build` to build the application.

5. Finally, run `yarn start` to start the server. Strava Atlas should be available at http://localhost:5000/.

Deploying a copy of Strava Atlas on a service like Heroku should be relatively straighforward. Tips for specific platforms:

* **Heroku**: Strava Atlas can be deployed directly from the GitHub repository, as long as you set `STRAVA_CLIENT_ID` & `STRAVA_CLIENT_SECRET` as Heroku "Config Vars".

## Contributing

Contributions to Strava Atlas are welcome! 😀

Bug reports and suggestions for changes can be posted as <a href="https://github.com/joshuahhh/strava-atlas/issues">GitHub Issues</a>.

If you wish to contribute code, that's fantastic! I suggest you start by describing your intended change in an issue, so we have the chance to talk about it first.

### Technical notes

* I intend for Strava Atlas to support Chrome, Firefox, and Safari. However, I do not intend for Strava Atlas to support older versions of any of these browsers.

## Secret features

### cross-storage access

The <a href="https://github.com/zendesk/cross-storage">`cross-storage` library</a> allows one site to access the `localStorage` of another. Using this, you can access Strava Atlas data from other sites. This involves two steps:

1. First, open the JavaScript console on https://strava-atlas.herokuapp.com/ and turn on this feature. You do this by setting `localStorage.crossStoragePermissions` to a `permissions` object, as described in the <a href="https://github.com/zendesk/cross-storage#crossstoragehubinitpermissions">cross-storage docs</a>. (`origin` should be provided as a string, rather than a regexp.) For instance, to make Strava Atlas data accessible from my <a href="https://observablehq.com/">Observable</a> notebooks, I run:

    ```
    localStorage.crossStoragePermissions = JSON.stringify([
        {origin: '^https://joshuahhh\\.static\\.observableusercontent\\.com$', allow: ['get']}
    ])
    ```

2. On the client side, access Strava Mapper as the <a href="https://github.com/zendesk/cross-storage">cross-storage docs</a> describe, starting with `new CrossStorageClient('https://strava-atlas.herokuapp.com/hub.html')`.

This is hacky / provisional / subject to change.

## Acknowledgements

Strava Atlas is inspired by Jonathan O'Keeffe's <a href="http://www.jonathanokeeffe.com/strava/map.php">Strava Multiple Ride Mapper</a>.
