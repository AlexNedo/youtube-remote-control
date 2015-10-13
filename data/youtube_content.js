//the main object which controls the player
var playerObject = window.content.document.getElementById("movie_player");
// var playerContainer = window.content.document.getElementById("player")
//a way to check if the player is visible playerContainer.className?classList.contains("off-screen")
(function(){
    if (!playerObject){
        console.error("NO LEGIT YOUTUBE SITE");
        self.port.emit("show-message", "No legit youtube player found.");
        return;
    }
    //get the real object from the wrapped addon js oject
    var player = playerObject.wrappedJSObject;
    
    //The video object where the actual video is being played in.
    //While player has all methods to control the playback,
    //the listeners have to be installed on the video object to work.
    let videotag = playerObject.getElementsByTagName("video")[0];
    
    if (!videotag) {
        console.error("Flash player not supported.");
        self.port.emit("show-message", "Flash player not supported. Use the HTML5 player.");
        return;
    }
    if(!player.getVideoData().video_id){
        console.error("NO LEGIT YOUTUBE SITE");
        self.port.emit("show-message", "No legit youtube player found.");
        return;
    }
    
    console.info("youtube_content.js attached");
    
    //playback rate changes
    var increaseTable = { 1: 1.25, 0.25: 0.5, 0.5: 1, 1.25: 1.5, 1.5: 2 }
    var decreaseTable = { 0.5: 0.25, 1: 0.5, 1.25: 1, 1.5: 1.25, 2:1.5 }
    
    //handler for incoming events from the panel via the index.js
    self.port.on("play-pause-video", function() {
        if (player.getPlayerState()==1) 
            player.pauseVideo(); 
        else 
            player.playVideo();
    });

    self.port.on("jump", (seconds) => player.seekBy(seconds));
    
    self.port.on("increase-rate-video", function(message) {
        rate = player.getPlaybackRate();
        newrate = increaseTable[rate];
        newrate && player.setPlaybackRate(newrate);
    });

    self.port.on("decrease-rate-video", function(message) {
        rate = player.getPlaybackRate();
        newrate = decreaseTable[rate];
        newrate && player.setPlaybackRate(newrate);
    });
    
    self.port.on("next-video", function(message) {
        player.nextVideo();
    });
    
    self.port.on("previous-video", function(message) {
        player.previousVideo();
    });
    
    self.port.on("detach", function(){
        videotag.removeEventListener("loadedmetadata", videoLoaded);
        videotag.removeEventListener("volumechange", volumeChanged);
        videotag.removeEventListener("ratechange", rateChanged);
    });
    
    self.port.on("set-player-volume", function(volume){
        player.setVolume(volume);
    });
    
    self.port.on("toggle-mute", function(){
        if (player.isMuted()){
            player.unMute();
        }else{
            player.mute();
        }
    });
    
    //functions for the event listeners
    function videoLoaded(event){
        //console.info("loadedmetadata adstate: " + player.getAdState());
        //adstate would be nice to detect ads, but does not work consistently
        //which state does adstate have? 1 0 -1 ?   (test 1 with ads, 0 without ads)
        //EDIT: Does not work consistently  sometime its always 1 event without ads
        self.port.emit("video-data", player.getVideoData());
    }

    function volumeChanged(){
        self.port.emit("set-panel-volume", player.getVolume(), player.isMuted(), false);
    }
    
    function rateChanged(){
        self.port.emit("playbackrate-changed", player.getPlaybackRate());
    }
    
    videotag.addEventListener("loadedmetadata", videoLoaded);
    videotag.addEventListener("volumechange", volumeChanged);
    videotag.addEventListener("ratechange", rateChanged);
        
    self.port.emit("attach-success");
    
    //These events need to be called after "attach-success" because their listeners
    //are installed by the "attach-success"" event.
    self.port.emit("set-panel-volume", player.getVolume(), player.isMuted(), true);
    self.port.emit("playbackrate-changed", player.getPlaybackRate());
    self.port.emit("video-data", player.getVideoData());
}())
