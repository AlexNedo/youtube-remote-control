var self = require('sdk/self');

//high level apis
var HLtabs = require("sdk/tabs");
var hotkeys = require("sdk/hotkeys");
var pageMod = require("sdk/page-mod");
var panels = require("sdk/panel");

//low level apis
var tabs = require("sdk/tabs/utils");
var windows = require("sdk/window/utils");
var buttons = require('sdk/ui/button/toggle');
var view = require("sdk/view/core");

console.info("======ADDON LOADED======")

//Reference to the conten script worker, which runs in the context of the youtube tab
//and handles incoming events from this index.js .
var registeredYoutubeWorker;
var attachedTabCandidate;
var attachedBrowser;
var oldUrl;

//addon toggle button in the toolbar
var button;
//the panel with the controls
var panel;

var allHotkeys = {};

//For handling the first situation where this handler gets called twice on youtube domains
//If one wants to reset the first situation handler set firstFlag=true and oldUrl=undefined
var firstFlag = true;
var secondFlag = false;

//BUTTON means the attach/detach button
//CONTROL are the buttons for controlling the video playback
var States = {
    //not attached to youtube tab and attach button not enabled
    DETACHED_BUTTON_DISABLED : 1,
    DETACHED_BUTTON_ENABLED : 2,
    ATTACHED_CONTROLS_ENABLED : 3,
    //attached to youtube, but controls disabled (for example going to a profile page on youtube)
    ATTACHED_CONTROLS_DISABLED : 4
}
var currentState = States.DETACHED_BUTTON_ENABLED;

var tabsProgressListener = {
    onLocationChange : function (browser, nsIWebProgress, request, location)
    {
        if (location.host=="www.youtube.com")
        {
            
            //Activate or deactivate the attach-button in the panel depending if the
            //current youtube site has or has not a valid player
            if (currentState == States.DETACHED_BUTTON_DISABLED 
                    && siteHasVideo(location["spec"]))
            {
                panel.port.emit("activate-button", true);
                currentState = States.DETACHED_BUTTON_ENABLED;
            } else 
            if(currentState == States.DETACHED_BUTTON_ENABLED 
                && !siteHasVideo(location["spec"]))
            {
                panel.port.emit("activate-button", false);
                currentState = States.DETACHED_BUTTON_DISABLED;
            }

            //This handles the very first call to youtube
            if (!oldUrl) 
            {
                oldUrl = location["spec"];
            }
            
            //There is a strange quirk within youtube, where this 
            //locationChangeHandler is called twice. So the first call, which has
            //still the old url as a given parameter in the location object, is
            //filtered out.
            if (location["spec"] == oldUrl && !secondFlag)
            {
                if(firstFlag)
                {
                    firstFlag = false;
                    secondFlag = true;
                }
                //ignore this tab location change
                return;
            }
            
            if (secondFlag){
                secondFlag=false;
            }
            
            oldUrl = location["spec"];
            
            
            //From here on it is guaranteed that this handler only gets called onced
            //per site change within youtube
                   
            if (attachedBrowser && browser == attachedBrowser)
            {
                
                //Here only the cases with an attached tab can happen:
                switch(currentState) {                  
                    case States.ATTACHED_CONTROLS_DISABLED:
                    if (siteHasVideo(location["spec"]))
                    {
                        panel.port.emit("activate-controls", true);
                        currentState = States.ATTACHED_CONTROLS_ENABLED;
                    }
                    break;
                    case States.ATTACHED_CONTROLS_ENABLED:
                    if (!siteHasVideo(location["spec"]))
                    {
                        panel.port.emit("activate-controls", false);
                        panel.port.emit("refresh-tab-title", "-");
                        currentState = States.ATTACHED_CONTROLS_DISABLED;
                    }

                    break;
                }
            }
        }
            
   }
}

//Test whether this is an url with a legit player (currently quite simple)
function siteHasVideo(url){
    return url.contains("watch?v=");
}

//Event handler for tab switches. Attach button is enabled or disabled accordingly.
function onSwitchTab(event){    
    let curTab = HLtabs.activeTab;
    if (siteHasVideo(curTab.url))
    {
        if (currentState == States.DETACHED_BUTTON_DISABLED)
        {
            panel.port.emit("activate-button", true);
            currentState = States.DETACHED_BUTTON_ENABLED;
        }        
    }
    else
    {
        if (currentState == States.DETACHED_BUTTON_ENABLED)
        {
            panel.port.emit("activate-button", false);
            currentState = States.DETACHED_BUTTON_DISABLED
        }
    }    
}

let tabbrowser=tabs.getTabBrowser(windows.getMostRecentBrowserWindow());
//Listener for site changes in a tab. Only way I found which works with youtube. 
//Site changes on youtube are no whole site changes. The DOM stays the same between changes.
//Thats why the content script still lives and the tab is still attached, when yotube-internal 
//site changes happen.
tabbrowser.addTabsProgressListener(tabsProgressListener);
//Listener for selecting other tabs.
tabbrowser.tabContainer.addEventListener("select", onSwitchTab);

//Here the panel is built and initialized
button = buttons.ToggleButton({
  id: "control-youtube",
  label: "Open youtube control panel",
  icon: {
    "16": "./icon-16.png",
    "32": "./icon-32.png",
    "64": "./icon-64.png"
  },
  onChange: handleChange
});

panel = panels.Panel({
  width: 380,
  height: 300,
  contentURL: "./panelContent.html",
  onHide: () => button.state("window", {checked: false})
});

//hotfix for displaying tooltips in the panel
require('sdk/view/core').getActiveView(panel)
    .setAttribute('tooltip', 'aHTMLTooltip');

function handleChange(state){
    if (state.checked){
        panel.show({position: button});
        panel.port.emit("panel-shown");
    }
}


//Events from the panel are redirected to the content script worker
panel.port.on("play-pause", () => registeredYoutubeWorker.port.emit("play-pause-video"));
panel.port.on("jump", (seconds) => registeredYoutubeWorker.port.emit("jump", seconds));
panel.port.on("faster", () => registeredYoutubeWorker.port.emit("increase-rate-video"));
panel.port.on("slower", () => registeredYoutubeWorker.port.emit("decrease-rate-video"));
panel.port.on("next-video", () => registeredYoutubeWorker.port.emit("next-video"));
panel.port.on("previous-video", () => registeredYoutubeWorker.port.emit("previous-video"));
panel.port.on("set-player-volume", (volume) => registeredYoutubeWorker.port.emit("set-player-volume", volume));
panel.port.on("toggle-mute", () => registeredYoutubeWorker.port.emit("toggle-mute"));
panel.port.on("loop-video", (checked) => registeredYoutubeWorker.port.emit("loop-video", checked));

function registerHotkeys(){
    allHotkeys.pauseKey =  hotkeys.Hotkey({combo:"accel-alt-k", onPress:() => registeredYoutubeWorker.port.emit("play-pause-video") });
    allHotkeys.muteKey = hotkeys.Hotkey({combo:"accel-alt-m", onPress:() => registeredYoutubeWorker.port.emit("toggle-mute") });
    allHotkeys.incRateKey = hotkeys.Hotkey({combo:"accel-alt-d", onPress:() => registeredYoutubeWorker.port.emit("increase-rate-video") });
    allHotkeys.decRateKey = hotkeys.Hotkey({combo:"accel-alt-a", onPress:() => registeredYoutubeWorker.port.emit("decrease-rate-video") });
    allHotkeys.backwardKey = hotkeys.Hotkey({combo:"accel-alt-j", onPress:() => registeredYoutubeWorker.port.emit("jump", -10) });
    allHotkeys.forwardKey = hotkeys.Hotkey({combo:"accel-alt-l", onPress:() => registeredYoutubeWorker.port.emit("jump", 10) });
    allHotkeys.loopKey = hotkeys.Hotkey({combo:"accel-alt-h", onPress:() => panel.port.emit("toggle-loop") });
    allHotkeys.nextKey = hotkeys.Hotkey({combo:"accel-alt-n", onPress:() => registeredYoutubeWorker.port.emit("next-video") });
    allHotkeys.prevKey = hotkeys.Hotkey({combo:"accel-alt-p", onPress:() => registeredYoutubeWorker.port.emit("previous-video") });
    allHotkeys.volUpKey = hotkeys.Hotkey({combo:"accel-alt-w", onPress:() => registeredYoutubeWorker.port.emit("increase-player-volume") });
    allHotkeys.volDownKey = hotkeys.Hotkey({combo:"accel-alt-s", onPress:() => registeredYoutubeWorker.port.emit("decrease-player-volume") });
}

function unregisterHotkeys(){
    allHotkeys.pauseKey.destroy();
    allHotkeys.muteKey.destroy();
    allHotkeys.incRateKey.destroy();
    allHotkeys.decRateKey.destroy();
    allHotkeys.backwardKey.destroy();
    allHotkeys.forwardKey.destroy();
    allHotkeys.loopKey.destroy();
    allHotkeys.nextKey.destroy();
    allHotkeys.prevKey.destroy();
    allHotkeys.volUpKey.destroy();
    allHotkeys.volDownKey.destroy();
}

panel.port.on("attach-to-tab", function(){
    attachedTabCandidate = HLtabs.activeTab;
    if (!attachedTabCandidate.url.contains("youtube.com")){
        panel.port.emit("show-message", "No legit youtube player found.");
        return;
    }
    //This tab is still not a guaranteed legit tab with a player inside. There are pages 
    //on youtube without a player. (channel page or the main page - Although the disabling
    //of the attach button should prevent this case.)
    //If this page is legit, then the content script will emit an "attach-success" event.
    registeredYoutubeWorker = attachedTabCandidate.attach({contentScriptFile: "./youtube_content.js"});
    registeredYoutubeWorker.port.on("attach-success", attachSuccess);
    registeredYoutubeWorker.port.on("show-message", (message) => panel.port.emit("show-message", message));

});

panel.port.on("detach-from-tab", function(){
    registeredYoutubeWorker.port.emit("detach");
    //destroy will cause the ondetach event which is registered in attachSuccess
    registeredYoutubeWorker.destroy();    
});


//This function gets called when the attached tab is manually detach
//content script gets destroyed via a tab close or a change to another non youtube site
function contentScriptWorkerDetached(){ 
    currentlyAttachedTab = null;
    attachedBrowser = null;
    
    unregisterHotkeys();

    //panel.port.emit throws an error at browser shutdown, because panel seems
    //to be already destroyed at this point
    panel.port.emit("tab-detached");
    currentState = States.DETACHED_BUTTON_ENABLED;
}

//This function gets called, when the conten script worker signals that 
//the attachedTabCandidate is valid
function attachSuccess(){    
    //These things should only happen when the youtube content script signals
    //that the youtube page is legit
    currentlyAttachedTab = attachedTabCandidate;
    attachedBrowser = tabs.getBrowserForTab(view.viewFor(currentlyAttachedTab));
    
    panel.port.emit("tab-attached");
    
    //install listeners for events from the content script
    registeredYoutubeWorker.port.on("video-data", function(videoData) {
        panel.port.emit("refresh-tab-title", videoData["title"]);
    });
    registeredYoutubeWorker.port.on("set-panel-volume", 
        (volume, isMuted, directUpdate) => panel.port.emit("set-panel-volume", volume, isMuted, directUpdate));
    
    registeredYoutubeWorker.port.on("playbackrate-changed", 
        (rate) => panel.port.emit("playbackrate-changed", rate));
    
    registeredYoutubeWorker.on("detach", contentScriptWorkerDetached );
    
    currentState = States.ATTACHED_CONTROLS_ENABLED;
    
    registerHotkeys();
};
