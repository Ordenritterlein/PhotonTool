function readCwsFile(fileArrayBuffer){
  JSZip.loadAsync(fileArrayBuffer)
        .then(function(zip) {
            let gCodeFile = null;
            zip.forEach(function (relativePath, zipEntry) {
              subFileName = zipEntry.name;
              subFileExtension = subFileName.slice((subFileName.lastIndexOf(".") - 1 >>> 0) + 2);
              if(subFileExtension == "gcode"){
                zip.file(subFileName).async("string").then(function (gcodeData) {
                  gCodeFile = gcodeData.split(/\r?\n/);
                  attributes = findAttributes(gCodeFile);
                  constructMesh(attributes, zip);
                });
              }
            });
        }, function (e) {
            console.log( "Error reading " + f.name + ": " + e.message );
        });
}

function constructMesh(attributes, zip){
  zip.file("slice00000.png").async("arraybuffer").then(function (layerArrayBuffer) {
    var pngImport = UPNG.decode(layerArrayBuffer);
    var pixelData = new DataView(UPNG.toRGBA8(pngImport)[0]);
    //var pixelArray = UPNG.toRGBA8(pngImport)[0];
    //png = UPNG.encode([pixelArray], pngImport.width, pngImport.height, 0);
    //saveByteArray(png, "Layer0", ".png");
  });
}

function findAttributes(gCode){
  gCodeAttributesSection = gCode.slice(0,50);
  outAttributes = {
    fileResolutionX : findValueInGCode(gCodeAttributesSection, "resolutionX", "X Resolution"),
    fileResolutionY : findValueInGCode(gCodeAttributesSection, "resolutionY", "Y Resolution"),
    fileBedSizeX : findValueInGCode(gCodeAttributesSection, "machineX", "Platform X Size"),
    fileBedSizeY : findValueInGCode(gCodeAttributesSection, "machineY", "Platform Y Size"),
    fileBedSizeZ : findValueInGCode(gCodeAttributesSection, "machineZ", "Platform Z Size"),
  }
  console.log(outAttributes);
  return outAttributes;
}

function findValueInGCode(gCodeArray, name, altName = null){
  val = null;
  for(i = 0; i < gCodeArray.length; i++){
    line = gCodeArray[i];
    if(line.includes(name) || (altName!=null && line.includes(altName))){
      if(line.includes("=")) val = parseFloat(line.slice(line.lastIndexOf("=")+1));
      if(line.includes(":")) val = parseFloat(line.slice(line.lastIndexOf(":")+1));
      break;
    }
  }
  return val;
}
