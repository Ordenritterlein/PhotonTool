let cws_Layer0Data = null;
let cws_Layer1Data = null;
let cws_Layer2Data = null;
let cws_LayerAttributes = [];
let cws_FileAttributes = null;
let cws_currentZHeight = 0;

function cws_readFile(fileArrayBuffer){
  cws_Layer0Data = null;
  cws_Layer1Data = null;
  cws_Layer2Data = null;
  cws_LayerAttributes = [];
  cws_FileAttributes = null;
  cws_currentZHeight = 0;
  JSZip.loadAsync(fileArrayBuffer)
        .then(function(zip) {
            let gCodeFile = null;
            zip.forEach(function (relativePath, zipEntry) {
              subFileName = zipEntry.name;
              subFileExtension = subFileName.slice((subFileName.lastIndexOf(".") - 1 >>> 0) + 2);
              if(subFileExtension == "gcode"){
                zip.file(subFileName).async("string").then(function (gcodeData) {
                  gCodeFile = gcodeData.split(/\r?\n/);
                  attributes = cws_findAttributes(gCodeFile);
                  cws_Layer0Data = new Uint8Array(new ArrayBuffer(attributes.fileResolutionX *  attributes.fileResolutionY));
                  cws_Layer1Data = new Uint8Array(new ArrayBuffer(attributes.fileResolutionX *  attributes.fileResolutionY));
                  cws_Layer2Data = new Uint8Array(new ArrayBuffer(attributes.fileResolutionX *  attributes.fileResolutionY));
                  let bedSizeX = attributes.fileBedSizeX ;
                  let bedSizeY = attributes.fileBedSizeY ;
                  let bedScaleX = attributes.fileBedSizeX / attributes.fileResolutionX;
                  let bedScaleY = attributes.fileBedSizeY / attributes.fileResolutionY;
                  initSlider(attributes.fileNumLayers);
                  cws_constructMesh(attributes, zip);
                });
              }
            });
        }, function (e) {
            console.log( "Error reading " + f.name + ": " + e.message );
        });
}

function cws_constructMesh(attributes, zip){
  currLayerName = "";
  //for(layerIndex = 0; layerIndex < attributes.fileNumLayers; layerIndex++){

  function cws_generateLayer(layerIndex){
    zip.forEach(function (relativePath, zipEntry) {
      subFileName = zipEntry.name;
      subFileExtension = subFileName.slice((subFileName.lastIndexOf(".") - 1 >>> 0) + 2);
      if(subFileExtension == "png"){
          num = parseInt(subFileName.replace(/\D/g,''));
          if(num == layerIndex) {
            zip.file(subFileName).async("arraybuffer").then(function (layerArrayBuffer) {
              var pngImport = UPNG.decode(layerArrayBuffer);
              cws_Layer0Data = cws_Layer1Data;
              cws_Layer1Data = cws_Layer2Data;
              cws_Layer2Data = cws_ConvertPngToLayer(new Uint8Array(UPNG.toRGBA8(pngImport)[0]));
              cws_generateLayerMeshVoxels(layerIndex-1);
              layerIndex++;
              if(layerIndex < cws_FileAttributes.fileNumLayers){
                cws_generateLayer(layerIndex);
              }else{
                cws_Layer0Data = cws_Layer1Data;
                cws_Layer1Data = cws_Layer2Data;
                cws_Layer2Data = new Uint8Array(new ArrayBuffer(cws_FileAttributes.fileResolutionX *  cws_FileAttributes.fileResolutionY));
                cws_generateLayerMeshVoxels(cws_FileAttributes.fileNumLayers-1); //generate last layer*/
                initSlider(cws_FileAttributes.fileNumLayers);
                console.log(layerMeshes);
              }
            });
          }
      }
    });
  }
  cws_generateLayer(0);
}

function cws_generateLayerMeshVoxels(layerIndex) {
 if(layerIndex >= 0){
    let t0 = performance.now();

    clearQuads();

    let pixelCount = cws_FileAttributes.fileResolutionX *  cws_FileAttributes.fileResolutionY;
    let pixelSizeX = cws_FileAttributes.fileResolutionX;
    let pixelSizeY = cws_FileAttributes.fileResolutionY;

    for (let iY = 1; iY < pixelSizeY - 1; ++iY) {
      for (let iX = 1; iX < pixelSizeX - 1; ++iX) {
        if (cws_Layer1Data[iY * pixelSizeX + iX] == 1) {
          let xN = cws_Layer1Data[iY * pixelSizeX + iX - 1];
          let xP = cws_Layer1Data[iY * pixelSizeX + iX + 1];

          let yN = cws_Layer1Data[(iY - 1) * pixelSizeX + iX];
          let yP = cws_Layer1Data[(iY + 1) * pixelSizeX + iX];

          let zN = cws_Layer0Data[iY * pixelSizeX + iX];
          let zP = cws_Layer2Data[iY * pixelSizeX + iX];

          let voxel = 0;

          if (xN == 0) voxel |= 1;
          if (xP == 0) voxel |= 2;
          if (yN == 0) voxel |= 4;
          if (yP == 0) voxel |= 8;
          if (zN == 0) voxel |= 16;
          if (zP == 0) voxel |= 32;

          if (voxel != 0) {
            pushVoxel(iX, iY, voxel, cws_LayerAttributes[layerIndex].layerHeight);
          }
        }
      }
    }

    layerMeshes.push(createMeshFromQuads(cws_currentZHeight));
    cws_currentZHeight += cws_LayerAttributes[layerIndex].layerHeight;

    t0 = performance.now() - t0;
    console.log('Created layer: ' + t0.toFixed(3) + ' ms');
  }
}

function cws_ConvertPngToLayer(pngPixelArray){
    outLayerData = new Uint8Array(new ArrayBuffer(attributes.fileResolutionX *  attributes.fileResolutionY));
    for(i = 0; i < outLayerData.length; i++){
      outLayerData[i] = pngPixelArray[i*4]/255;
    }
    return outLayerData;
}

function cws_findAttributes(gCode){
  gCodeAttributesSection = gCode.slice(0,50);
  cws_FileAttributes = {
    fileResolutionX : cws_findValueInGCode(gCodeAttributesSection, "resolutionX", "X Resolution"),
    fileResolutionY : cws_findValueInGCode(gCodeAttributesSection, "resolutionY", "Y Resolution"),
    fileBedSizeX : cws_findValueInGCode(gCodeAttributesSection, "machineX", "Platform X Size"),
    fileBedSizeY : cws_findValueInGCode(gCodeAttributesSection, "machineY", "Platform Y Size"),
    fileBedSizeZ : cws_findValueInGCode(gCodeAttributesSection, "machineZ", "Platform Z Size"),
    fileNumLayers : cws_findValueInGCode(gCodeAttributesSection, "Number of Slices")
  }

  gCodeLayersSection = gCode;

  layerLoop:
  for(i = 0; i < cws_FileAttributes.fileNumLayers; i++){
    gCodeLayerIndex = cws_findGCodeIndexOf(gCodeLayersSection, "<Slice> " + i);
    gCodeLayersSection = gCodeLayersSection.slice(gCodeLayerIndex);
    zDist = -1;
    layerAttributesLoop:
    for(j = 0; j < 10; j++){
      arg = gCodeLayersSection[j];
      if(arg.includes("G1")){
        value = parseFloat(arg.split(" ")[1].replace("Z", ""));
        if(zDist == -1) {zDist = value;} else {zDist += value; break layerAttributesLoop; }
      }
    }
    cws_LayerAttributes.push({
      layerHeight:zDist
    })
  }
  return cws_FileAttributes;
}

function cws_findGCodeIndexOf(gCodeArray, string){
  out = -1;
  for(k = 0; k < gCodeArray.length; k++){
    line = gCodeArray[k];
    if(line.includes(string)){
      out = k;
      break;
    }
  }
  return out;
}

function cws_findValueInGCode(gCodeArray, name, altName = null){
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
