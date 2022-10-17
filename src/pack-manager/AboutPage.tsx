import { VFC } from "react";

export const AboutPage: VFC = () => {
  return (
    <>
      <h2>About</h2>
      <p>
        Audio Loader is a plugin for the Decky Loader that allows users to
        replace Steam UI sounds and add music when outside of a game. The source
        code is available on GitHub under the MIT License if you would like to
        make contributions. https://eme.wtf/audioloader
      </p>
      <h2>Creating Packs</h2>
      <p>
        If you are interested in creating a music or sound pack for Audio
        Loader, please consult our guide on GitHub. https://eme.wtf/audioguide
      </p>
    </>
  );
};
