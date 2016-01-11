var buttons = document.getElementsByClassName("control");
var attachButton = document.getElementById("attach-button");
var errorMessage = document.getElementById("error-message");
var volumeSlider = document.getElementById("volume");
var currentAttached = document.getElementById("current-attached");
var muteButton = document.getElementById("mute");
var rateViewer = document.getElementById("rate-viewer");
var loopCheckbox = document.getElementById("loop");
var isAttached = false;

//changes from the player will only be saved to this background variable
//the actual update of the volume slider in the panel happens when the panel is opened
var proxyVolume;

//functions for the controls
function playPause(){
    addon.port.emit("play-pause"); 
}
function jump(seconds){
    addon.port.emit("jump", seconds);
}
function slower(){
    addon.port.emit("slower");
}
function faster(){
    addon.port.emit("faster");
}
function next(){
    addon.port.emit("next-video");
}
function prev(){
    addon.port.emit("previous-video");
}
function attachToTab(){
    addon.port.emit(isAttached ? "detach-from-tab": "attach-to-tab");    
}

//functions for enabling/disabling controls
function changeButtonState(enable){
    enable ? attachButton.removeAttribute("disabled") : attachButton.setAttribute("disabled", "disabled");
}

function changeControlsState(enable){
    Array.prototype.forEach.call(buttons, elem => enable ? elem.removeAttribute("disabled") : elem.setAttribute("disabled", "disabled"));
}

//updates the text view which shows the currently attached tab
function setCurrentAttachedText(text){
    currentAttached.textContent = text;
}

//sends volume change events to the player in the content script
function changeVolume(value, isMuted, directUpdate){        
    proxyVolume = value;
    if(directUpdate) volumeSlider.value = proxyVolume;
    var imageToTake;
    if (isMuted){
        imageToTake = "speaker_none.png";
    }else{
        if (value < 33){
            imageToTake = "speaker_low.png";
        }
        else if (value < 66){
            imageToTake = "speaker_medium.png";
        }else{
            imageToTake = "speaker_full.png";
        }
    }
    muteButton.src = imageToTake;
}

function toggleMute(){
    if (isAttached) addon.port.emit("toggle-mute");
}

//this is called everytime this panels is openend
function panelShow(){
    volumeSlider.value = proxyVolume;
    errorMessage.textContent = "";
}

function playbackrateChanged(rate){        
    rateViewer.textContent = rate;
}

//event handler for the volume slider
volumeSlider.addEventListener("input", function (e) {
    if (isAttached) addon.port.emit("set-player-volume", e.target.value);
});

loopCheckbox.addEventListener("change", (e) => 
        isAttached && addon.port.emit("loop-video", e.target.checked));

//installs listeners for all used events
addon.port.on("activate-button", changeButtonState);    
addon.port.on("activate-controls", changeControlsState);
addon.port.on("show-message", (message) => errorMessage.textContent = message);    
addon.port.on("refresh-tab-title", setCurrentAttachedText);

addon.port.on("toggle-loop", () => loopCheckbox.click() );

addon.port.on("tab-attached", function() {
    changeControlsState(true);
    attachButton.textContent = "Detach current tab";
    isAttached = true;
    loopCheckbox.checked = false;
});
addon.port.on("tab-detached", function() {
        changeControlsState(false);
        attachButton.textContent = "Attach current tab";
        isAttached = false;
        setCurrentAttachedText("-");
});
addon.port.on("set-panel-volume", changeVolume);
addon.port.on("panel-shown", panelShow);    
addon.port.on("playbackrate-changed", playbackrateChanged);