import { StravaSummaryActivity } from "../stravaApi";
import "./Welcome.css";

interface WelcomeProps {
  actDataSync: StravaSummaryActivity[] | undefined;
}

export default function Welcome({ actDataSync }: WelcomeProps) {
  return (
    <div className="Welcome">
      <div className="Welcome-row">
        <div className="Welcome-left">Strava Atlas</div>
        {actDataSync ? (
          <div className="Welcome-right">
            <p>
              Please wait a minute while your Strava data is downloaded to your
              browser.
            </p>
            <p className="Shared-loading-progress Welcome-loading-progress">
              {actDataSync.length} activities
            </p>
            <p>You won't have to do this on future visits. :)</p>
          </div>
        ) : (
          <div className="Welcome-right">
            <p>
              A free third-party tool which draws all your activities onto a
              single explorable map.
            </p>
            <p>
              <a href="api/redirect-to-auth">
                <img
                  src="btn_strava_connectwith_orange@2x.png"
                  alt="Connect with Strava"
                  width={193}
                />
              </a>
            </p>
            <p>
              <img
                className="Welcome-map-img"
                src="map.png"
                alt="Screenshot of Strava Atlas, showing map"
              />
            </p>
            <p>Your Strava data will not leave your browser.</p>
            <p>
              This is an open-source project. Find out more{" "}
              <a href="https://github.com/joshuahhh/strava-atlas">on GitHub</a>!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
