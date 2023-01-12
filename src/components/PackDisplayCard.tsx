import { FC, Ref } from "react";
import { PanelSectionRow, ButtonItem } from "decky-frontend-lib";
import { motion } from "framer-motion";
import { useGlobalState } from "../state/GlobalState";
import { Pack, packDbEntry } from "../classes";

export const PackDisplayCard: FC<{
  data: packDbEntry;
  i: number;
  installRef: Ref<number>;
  downloadCallback: (e: packDbEntry, i: number) => void;
}> = ({ data: e, i, installRef, downloadCallback }) => {
  const { soundPacks, isInstalling } = useGlobalState();
  function checkIfPackInstalled(themeObj: packDbEntry) {
    const filteredArr: Pack[] = soundPacks.filter(
      (e: Pack) => e.name === themeObj.name && e.author === themeObj.author
    );
    if (filteredArr.length > 0) {
      if (filteredArr[0].version === themeObj.version) {
        return "installed";
      } else {
        return "outdated";
      }
    } else {
      return "uninstalled";
    }
  }

  const installStatus = checkIfPackInstalled(e);
  return (
    // The outer 2 most divs are the background darkened/blurred image, and everything inside is the text/image/buttons
    <>
      <div
        className="AudioLoader_PackBrowser_SingleItem_Container1"
        style={{
          width: "100%",
          marginLeft: "10px",
          marginRight: "10px",
          marginBottom: "20px",
        }}
      >
        <div
          className="AudioLoader_PackBrowser_SingleItem_Container2"
          style={{
            // Really this could be combined with the above div, its just that in CSSLoader there's 2 here, and I didn't want to merge them because its 1am
            width: "100%",
            display: "flex",
            alignItems: "center",
            height: "100%",
          }}
        >
          <div
            // I'm still using the format of div-with-a-bg-image, because I think that could make it a bit easier to add icons/text in front if we want
            className="AudioLoader_PackBrowser_SingleItem_PreviewImageContainer"
            style={{
              width: "200px",
              height: "200px",
              position: "relative",
            }}
          >
            <div
              style={{
                background: e.music
                  ? "url(https://i.imgur.com/nISGpci.png)"
                  : "linear-gradient(150deg, rgba(0, 0, 0, 0) 0%, rgba(118, 118, 118, 0) 0%, rgba(255, 255, 255, 0.2) 32%, rgba(255, 255, 255, 0.2) 35%, rgba(255, 255, 255, 0.2) 38%, rgba(210, 210, 210, 0) 70%, rgba(0, 0, 0, 0) 100%) 0% 0% / cover",
                position: "absolute",
                top: "10%",
                left: "0",
                width: "80%",
                height: "80%",
                backgroundSize: "cover",
                zIndex: 3,
                borderRadius: "2px",
              }}
            />
            <div
              style={{
                backgroundImage: 'url("' + e.preview_image + '")',
                backgroundColor: "#21323d",
                position: "absolute",
                top: "10%",
                left: "0",
                width: "80%",
                height: "80%",
                backgroundSize: "cover",
                zIndex: 2,
                borderRadius: "2px",
              }}
            />
            <motion.div
              // @ts-ignore - stupid "ref could be null" things here
              animate={installRef.current === i ? { rotate: 360 } : {}}
              exit={{}}
              transition={{
                // @ts-ignore
                repeat: installRef.current === i ? Infinity : 0,
                // @ts-ignore
                duration: installRef.current === i ? 1.82 : 0.001,
                ease: "linear",
              }}
              style={{
                backgroundImage: e.music
                  ? 'url("https://i.imgur.com/V9t3728.png")'
                  : 'url("https://i.imgur.com/pWm35T0.png")',
                position: "absolute",
                top: "12.5%",
                right: "0",
                width: "75%",
                height: "75%",
                backgroundSize: "cover",
                zIndex: 1,
                rotate: 0,
              }}
            />
          </div>
          <div
            style={{
              width: "calc(100% - 220px)", // The calc is here so that the text section doesn't expand into the image
              display: "flex",
              flexDirection: "column",
              height: "100%",
              marginLeft: "1em",
              justifyContent: "center",
            }}
          >
            <span
              className="AudioLoader_PackBrowser_SingleItem_ThemeName"
              style={{
                fontSize: "1.25em",
                fontWeight: "bold",
                // This stuff here truncates it if it's too long (prolly not gonna happen on audioloader, just code from cssloader)
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                width: "90%",
              }}
            >
              {e.name}
            </span>
            <span
              className="AudioLoader_PackBrowser_SingleItem_AuthorText"
              style={{
                marginRight: "auto",
                fontSize: "1em",
                // The text shadows are leftover from cssloader, you can experiment with removing them if you want
                textShadow: "rgb(48, 48, 48) 0px 0 10px",
              }}
            >
              {e.author}
            </span>
            <span
              className="AudioLoader_PackBrowser_SingleItem_ThemeTarget"
              style={{
                fontSize: "1em",
                textShadow: "rgb(48, 48, 48) 0px 0 10px",
              }}
            >
              {e.music ? "Music" : "Sound"} | {e.version}
            </span>
            <span
              className="AudioLoader_PackBrowser_SingleItem_DescriptionText"
              style={{
                fontSize: "13px",
                textShadow: "rgb(48, 48, 48) 0px 0 10px",
                color: "#969696",
                WebkitLineClamp: "3",
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                display: "-webkit-box",
              }}
            >
              {e.description ? (
                e.description
              ) : (
                <span>
                  <i style={{ color: "#666" }}>No description provided.</i>
                </span>
              )}
            </span>

            <div
              className="AudioLoader_PackBrowser_SingleItem_InstallButtonContainer"
              style={{
                marginTop: "1em",
                width: "245px",
                overflow: "hidden",
              }}
            >
              <PanelSectionRow>
                <div
                  className="AudioLoader_PackBrowser_SingleItem_InstallContainer"
                  style={{
                    // This padding here overrides the default padding put on PanelSectionRow's by Valve
                    // Before this, I was using negative margin to "shrink" the element, but this is a much better solution
                    paddingTop: "0px",
                    paddingBottom: "0px",
                  }}
                >
                  <ButtonItem
                    bottomSeparator="none"
                    layout="below"
                    disabled={isInstalling || installStatus === "installed"}
                    onClick={() => {
                      downloadCallback(e, i);
                    }}
                  >
                    <span className="AudioLoader_PackBrowser_SingleItem_InstallText">
                      {installStatus === "outdated"
                        ? "Update Available"
                        : installStatus === "uninstalled"
                        ? "Install"
                        : "Installed"}
                    </span>
                  </ButtonItem>
                </div>
              </PanelSectionRow>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
