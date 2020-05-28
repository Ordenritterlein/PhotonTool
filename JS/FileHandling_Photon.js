function getLayerBitsView(idx, isPhotonS) {

  let layer = photonFile.layers[idx];
  let o = isPhotonS ? layer.layerDataPosition : layer.dataOffset;
  let pigselz = 0;

  let dataArray = new ArrayBuffer(photonFile.header.resX * photonFile.header.resY);
  let dataArrayView = new Uint8Array(dataArray);

  while (pigselz < photonFile.header.resX * photonFile.header.resY) {

    if(isPhotonS){
      ///////////////////////////////////////////////////////////////// Photon S

      let b = photonFile.fileDataView.getUint8(o++);
      let pixelCount = // reverse the bit order of bit 2 to 8 and place them from 1 to 7
        ((b & 128 ? 1 : 0) |
        (b & 64 ? 2 : 0) |
        (b & 32 ? 4 : 0) |
        (b & 16 ? 8 : 0) |
        (b & 8 ? 16 : 0) |
        (b & 4 ? 32 : 0) |
        (b & 2 ? 64 : 0)) + 1 ;

      if (b & 1) // first bit is color
      {
        for (let i = 0; i < pixelCount; ++i) {
          dataArrayView[(pigselz + i)] = 1;
        }
      } else {
        for (let i = 0; i < pixelCount; ++i) {
          dataArrayView[(pigselz + i)] = 0;
        }
      }
      pigselz += pixelCount;

    }else{
      ///////////////////////////////////////////////////////////////// Photon
      let b = photonFile.fileDataView.getInt8(o++);
      let pixelCount = b;
      if (pixelCount < 0)
      {
        pixelCount = 128 + pixelCount;
        for (let i = 0; i < pixelCount; ++i) {
          dataArrayView[(pigselz + i)] = 1;
        }
      } else {
        for (let i = 0; i < pixelCount; ++i) {
          dataArrayView[(pigselz + i)] = 0;
        }
      }
      pigselz += pixelCount;

    }

  }

  return dataArrayView;
}

function loadImage(o, d, isPhotonS = false) {

  if(isPhotonS){
    /////////////////////////////////////////////////////////////////////// photon S
    let header = {
      width: d.getUint32(82, false),
      height: d.getUint32(90, false),
    };

    let img = new ArrayBuffer(header.width * header.height * 3);
    let imgView = new Uint8Array(img);

    o = 96;
    let j = 0;
    let pixels = 0;

    while (j < 75264) {
      let entry = d.getUint8(o + j + 1) << 8 | d.getUint8(o + j);
      j += 2;

      let r = Math.floor(((entry >>> 0) & 0x1F) * 8);
      let g = Math.floor(((entry >>> 6) & 0x1F) * 8);
      let b = Math.floor(((entry >>> 11) & 0x1F) * 8);

      imgView[pixels * 3 + 0] = r;
      imgView[pixels * 3 + 1] = g;
      imgView[pixels * 3 + 2] = b;
      ++pixels;

    }

    return {
      width: header.width,
      height: header.height,
      dataView: imgView
    };

  }else{
    /////////////////////////////////////////////////////////////////////// photon
    let header = {
      width: d.getUint32(o + 0, true),
      height: d.getUint32(o + 4, true),
      data: d.getUint32(o + 8, true),
      size:  d.getUint32(o + 12, true)
    };

    let img = new ArrayBuffer(header.width * header.height * 3);
    let imgView = new Uint8Array(img);

    // Until we've read all the size
    console.log('Image: ', header);

    o = header.data;
    let j = 0;
    let pixels = 0;

    while (j < header.size) {
      let entry = d.getUint16(o + j, true);
      j += 2;

      let r = Math.floor(((entry >>> 11) & 0x1F) / 31 * 255);
      let g = Math.floor(((entry >>> 6) & 0x1F) / 31 * 255);
      let b = Math.floor(((entry >>> 0) & 0x1F) / 31 * 255);

      let repeat = 1;

      if (entry & 0x20) {
        let cmd = d.getUint16(o + j, true);
        j += 2;
        let c = (cmd & 0xFF00) >>> 8;
        repeat += cmd & 0x0FFF;
      }

      for (let i = 0; i < repeat; ++i) {
        imgView[pixels * 3 + 0] = r;
        imgView[pixels * 3 + 1] = g;
        imgView[pixels * 3 + 2] = b;
        ++pixels;
      }
    }

    return {
      width: header.width,
      height: header.height,
      dataView: imgView
    };

  }
}

function loadPhotonFile(d, isPhotonS) {
  if(isPhotonS){

    ////////////////////////////////////////////////////////////// .Photons

    let header = {
      bedSizeX: 68.04,
      bedSizeY: 120.96,
      bedSizeZ: 160.0,
      layerThickness: d.getFloat64(14, false), // Big endian!
      exposureTime: d.getFloat64(22, false),
      bottomExposureTime: d.getFloat64(38, false),
      offTime: d.getFloat64(30, false),
      bottomLayers: d.getUint32(46, false),
      resX: 1440, //is now for some reason per layer so also hardcode.
      resY: 2560,
      layers: d.getUint32(75362, false) // preview Image size and position is hardcoded now
    };

    console.log(header);

    let layers = [];

    currentLayerOffset = 75366;  // layers always start after the hardcoded Preview image, so, also hardcoded.
    currentLayerZPos = header.layerThickness;

    for (let i = 0; i < header.layers; ++i) {

      let layer = {
        position: currentLayerZPos,
        layerDataPosition: currentLayerOffset + 28,
        dataSize: d.getUint32(currentLayerOffset + 20, false) /8
      };

      currentLayerOffset += layer.dataSize + 24;
      currentLayerZPos += header.layerThickness;

      layers.push(layer);
    }

    photonFile = {
      fileDataView: d,
      header: header,
      layers: layers
    };

  }else{

  ////////////////////////////////////////////////////////////// .Photon

    let header = {
      bedSizeX: d.getFloat32(8, true),
      bedSizeY: d.getFloat32(12, true),
      bedSizeZ: d.getFloat32(16, true),
      layerThickness: d.getFloat32(32, true),
      exposureTime: d.getFloat32(36, true),
      bottomExposureTime: d.getFloat32(40, true),
      offTime: d.getFloat32(44, true),
      bottomLayers: d.getUint32(48, true),
      resX: d.getUint32(52, true),
      resY: d.getUint32(56, true),
      bigThumbOffset: d.getUint32(60, true),
      layersOffset: d.getUint32(64, true),
      layers: d.getUint32(68, true),
      smallThumbOffset: d.getUint32(72, true)
    };

    console.log(header);

    let layers = [];

    for (let i = 0; i < header.layers; ++i) {
      let o = header.layersOffset + i * 36;

      let layer = {
        position: d.getFloat32(o + 0, true),
        exposureTime: d.getFloat32(o + 4, true),
        offTime: d.getFloat32(o + 8, true),
        dataOffset: d.getUint32(o + 12, true),
        dataSize: d.getUint32(o + 16, true)
      };

      console.log(layer.position);

      layers.push(layer);
    }

    photonFile = {
      fileDataView: d,
      header: header,
      layers: layers
    };

  }
}

function generateLayerMeshVoxels(idx, isPhotonS) {

  let t0 = performance.now();

  clearQuads();
  let quadCount = 0;

  let pixelCount = photonFile.header.resX * photonFile.header.resY;
  let pixelSizeX = photonFile.header.resX;
  let pixelSizeY = photonFile.header.resY;

  let layers0;
  let layers2;

  if (idx > 0)
    layers0 = getLayerBitsView(idx - 1, isPhotonS);
  else
    layers0 = new Uint8Array(new ArrayBuffer(pixelCount));

  if (idx < photonFile.layers.length - 1)
    layers2 = getLayerBitsView(idx + 1, isPhotonS);
  else
    layers2 = new Uint8Array(new ArrayBuffer(pixelCount));

  let layers1 = getLayerBitsView(idx, isPhotonS);

  let voxels = new Uint8Array(new ArrayBuffer(pixelCount));

  for (let iY = 1; iY < pixelSizeY - 1; ++iY) {
    for (let iX = 1; iX < pixelSizeX - 1; ++iX) {
      if (layers1[iY * pixelSizeX + iX] == 1) {
        let xN = layers1[iY * pixelSizeX + iX - 1];
        let xP = layers1[iY * pixelSizeX + iX + 1];

        let yN = layers1[(iY - 1) * pixelSizeX + iX];
        let yP = layers1[(iY + 1) * pixelSizeX + iX];

        let zN = layers0[iY * pixelSizeX + iX];
        let zP = layers2[iY * pixelSizeX + iX];

        let voxel = 0;

        if (xN == 0) voxel |= 1;
        if (xP == 0) voxel |= 2;
        if (yN == 0) voxel |= 4;
        if (yP == 0) voxel |= 8;
        if (zN == 0) voxel |= 16;
        if (zP == 0) voxel |= 32;

        voxels[iY * pixelSizeX + iX] = voxel;

        if (voxel != 0) {
          pushVoxel(iX, iY, voxel);
          ++quadCount; // wrong and unused
        }
      }
    }
  }

  let layer = photonFile.layers[idx];
  layer.object = createMeshFromQuads(layer.position, 1.0);

  t0 = performance.now() - t0;
  console.log('Created layer: ' + t0.toFixed(3) + ' ms');
}

/*
let d = new DataView(event.target.result);
console.log('Read file');

clear3dScene();

//load file
loadPhotonFile(d, isPhotonS);

//generate thumbnail
//renderThumbnail(loadImage(photonFile.header.smallThumbOffset, d, isPhotonS), document.getElementById('thumb-small'));

//create and initialize Slider
let slider = document.getElementById('layer-slider');
slider.max = photonFile.header.layers - 1;
slider.oninput = function(event) {
  for (let i = 0; i < photonFile.layers.length; ++i) {
    let ob = photonFile.layers[i].object;
    ob.mesh.visible = (slider.value >= i);
  }
}
slider.value = photonFile.header.layers - 1;

//async layer processing
function processLayer(idx, maxLayers, isS) {
  generateLayerMeshVoxels(idx, isS);

  // Note: Process each layer without blocking the UI.
  if (idx < maxLayers - 1) {
    setTimeout(() => {
      processLayer(idx + 1, maxLayers, isS);
    }, 0);
  }
}
processLayer(0, photonFile.header.layers, isPhotonS);
*/

/*function renderThumbnail(image, canvas) {
  canvas.width = image.width;
  canvas.height = image.height;
  let ctx = canvas.getContext('2d');
  let imageData = ctx.getImageData(0, 0, image.width, image.height);

  for (let i = 0; i < image.width * image.height; ++i) {
    imageData.data[i * 4 + 0] = image.dataView[i * 3 + 0];
    imageData.data[i * 4 + 1] = image.dataView[i * 3 + 1];
    imageData.data[i * 4 + 2] = image.dataView[i * 3 + 2];
    imageData.data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
}*/
