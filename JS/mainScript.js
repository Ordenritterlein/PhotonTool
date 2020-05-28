const bedSizeX = 68.04;
const bedSizeY = 120.96;
const bedScaleX = bedSizeX / 1440;
const bedScaleY = bedSizeY / 2560;

let photonFile = null;
let sceneScale = 0.1;
let quads = [];
let sliceMesh = null;
let scene = null;

let cameraOrbitTarget = null; // global orbit target mesh
let renderer = null;
let camera = null;

//-------------------------------------------------------------------------------------------
// Material setup
//-------------------------------------------------------------------------------------------
voxelMaterial = new THREE.ShaderMaterial( {
  uniforms: {	},
  vertexShader: document.getElementById( 'vert_BaseShader' ).textContent,
  fragmentShader: document.getElementById( 'frag_BaseShader' ).textContent,
  side: THREE.DoubleSide
} );

//-------------------------------------------------------------------------------------------
// Voxels.
//-------------------------------------------------------------------------------------------
function pushVoxel(x, y, sides, height = 1) { //add quads to array, sides is 6 bits indicating if a voxel's side is visible
  x *= bedScaleX;
  y *= bedScaleY;

  if (sides & 1) {
    quads.push(x, 0, y + bedScaleY); //xyz
    quads.push(x, height, y + bedScaleY);
    quads.push(x, height, y);
    quads.push(x, 0, y);
  }

  if (sides & 2) {
    quads.push(x + bedScaleX, 0, y);
    quads.push(x + bedScaleX, height, y);
    quads.push(x + bedScaleX, height, y + bedScaleY);
    quads.push(x + bedScaleX, 0, y + bedScaleY);
  }

  if (sides & 4) {
    quads.push(x, 0, y);
    quads.push(x, height, y);
    quads.push(x + bedScaleX, height, y);
    quads.push(x + bedScaleX, 0, y);
  }

  if (sides & 8) {
    quads.push(x + bedScaleX, 0, y + bedScaleY);
    quads.push(x + bedScaleX, height, y + bedScaleY);
    quads.push(x, height, y + bedScaleY);
    quads.push(x, 0, y + bedScaleY);
  }

  if (sides & 16) {
    quads.push(x, 0, y);
    quads.push(x + bedScaleX, 0, y);
    quads.push(x + bedScaleX, 0, y + bedScaleY);
    quads.push(x, 0, y + bedScaleY);
  }

  if (sides & 32) {
    quads.push(x, height, y + bedScaleY);
    quads.push(x + bedScaleX, height, y + bedScaleY);
    quads.push(x + bedScaleX, height, y);
    quads.push(x, height, y);
  }
}

function clearQuads() { //empty the "quads"-array
  quads = [];
}

function createMeshFromQuads(yPos, yMax) { //create mesh from the "quads"-array, yMax is not used
  let sliceGeo = new THREE.BufferGeometry();
  var vertices = new Float32Array(quads);

  sliceGeo.addAttribute('position', new THREE.BufferAttribute(vertices, 3)); //add quad vertex positions to array

  let quadCount = quads.length / 12; // x y and z for 4 vertices per quad

  //each quad needs 6 vertices to be drawn correctly (two tris) so make an index buffer that instructs the renderer
  //to re-use two of the vertices defined in quads. this probably saves on space, but I'm not sure
  let indexBuffer = new Array(quadCount * 6);  //6 indeces per quad
  for (let i = 0; i < quadCount; ++i) {
    let idx = i * 6;

    indexBuffer[idx + 0] = i * 4 + 0;
    indexBuffer[idx + 1] = i * 4 + 1;
    indexBuffer[idx + 2] = i * 4 + 2;
    indexBuffer[idx + 3] = i * 4 + 0;
    indexBuffer[idx + 4] = i * 4 + 2;
    indexBuffer[idx + 5] = i * 4 + 3;
  }

  // generate uvs for each face
  let uvBuffer = new Float32Array(quadCount * 8); //u and v for 4 vertices per quad
  for (let j = 0; j < quadCount; j++) {
    let idx = j * 8;
    uvBuffer[idx + 0] = -1.0; uvBuffer[idx + 1] = -1.0;
    uvBuffer[idx + 2] = 1.0; uvBuffer[idx + 3] = -1.0;
    uvBuffer[idx + 4] = 1.0; uvBuffer[idx + 5] = 1.0;
    uvBuffer[idx + 6] = -1.0; uvBuffer[idx + 7] = 1.0;
  }

  sliceGeo.addAttribute( 'uv', new THREE.BufferAttribute( uvBuffer, 2 ) );
  sliceGeo.setIndex(indexBuffer);
  sliceGeo.computeVertexNormals();
  let mat = voxelMaterial;

  //position and scale mesh correctly
  sliceMesh = new THREE.Mesh( sliceGeo, mat );
  sliceMesh.position.x = bedSizeX * 0.5 * sceneScale;
  sliceMesh.position.z = -bedSizeY * 0.5 * sceneScale;
  sliceMesh.position.y = yPos * sceneScale;
  sliceMesh.scale.x = -sceneScale;
  sliceMesh.scale.y = sceneScale * photonFile.header.layerThickness;
  sliceMesh.scale.z = sceneScale;

  scene.add(sliceMesh);

  return {
    mesh: sliceMesh,
    mat: mat
  };
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

//-------------------------------------------------------------------------------------------
// Photon file utilities.
//-------------------------------------------------------------------------------------------
// Uncrompress a layer's image data and return an array.

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

// Render image data to a canvas.
function renderThumbnail(image, canvas) {
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
}

//-------------------------------------------------------------------------------------------
// File handling.
//-------------------------------------------------------------------------------------------
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

function onFileSelected(evt) {
  let files = evt.target.files;

  fname = evt.target.files[0].name;
  fextension = fname.slice((fname.lastIndexOf(".") - 1 >>> 0) + 2);
  //isPhotonS = fextension == 'photons';

  console.log('Load file');

  if (files.length == 1) {
    let r = new FileReader();
    r.onload = function(event) {
      loadFile(event.target.result, fextension);

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
    };

    r.readAsArrayBuffer(files[0]);
  }
}

//-------------------------------------------------------------------------------------------
// 3D scene helpers.
//-------------------------------------------------------------------------------------------
function create3dScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color( 0x646464 );
  camera = new THREE.PerspectiveCamera( 75, 1280 / 720, 0.01, 100 );
  let controls = new THREE.OrbitControls(camera, document.getElementById('gl-view'));
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(1280, 720);
  document.getElementById('gl-view').appendChild( renderer.domElement );
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.width = "100%";

  var gizmo_Vertices = [
    -1, 0, 0,	1, 0, 0,
    0, -1, 0,	0, 1, 0,
    0, 0, -1,	0, 0, 1
  ];
  var gizmo_Colors = [
    1, 0, 0,	1, 0.1, 0,
    0, 1, 0,	0.1, 1, 0,
    0, 0, 1,	0, 0.1, 1
  ];
  var gizmo_Geometry = new THREE.BufferGeometry();
  gizmo_Geometry.addAttribute( 'position', new THREE.Float32BufferAttribute( gizmo_Vertices, 3 ) );
  gizmo_Geometry.addAttribute( 'color', new THREE.Float32BufferAttribute( gizmo_Colors, 3 ) );
  var gizmo_Material = new THREE.LineBasicMaterial( { vertexColors: THREE.VertexColors } );
  cameraOrbitTarget = new THREE.LineSegments(gizmo_Geometry, gizmo_Material);
  scene.add( cameraOrbitTarget );

  let gridHelper = new THREE.GridHelper(120 * sceneScale, 24 );
  console.log(gridHelper.position);
  scene.add(gridHelper);

  camera.position.set( 0, 3, 3);

  controls.update();
  controls.updateGizmo();

  resizeCanvasToDisplaySize(renderer, camera);

  // Update the 3d view at the browser framerate.
  function animate() {
    requestAnimationFrame( animate );
    renderer.render( scene, camera );
  }
  animate();
}

function clear3dScene() {
  if (!photonFile) {
    return;
  }

  for (let i = 0; i < photonFile.layers.length; ++i) {
    let ob = photonFile.layers[i].object;

    scene.remove(ob.mesh);
    ob.mesh.geometry.dispose();
    ob.mat.dispose();
  }

  photonFile = null;
}

function resizeCanvasToDisplaySize() {
  const canvas = document.getElementById("gl-view").firstChild;
  // look up the size the canvas is being displayed
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  // adjust displayBuffer size to match
  if (canvas.width !== width || canvas.height !== height) {
    // you must pass false here or three.js sadly fights the browser
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // update any render target sizes here
  }
}

//-------------------------------------------------------------------------------------------
// Application entry.
//-------------------------------------------------------------------------------------------
create3dScene();
