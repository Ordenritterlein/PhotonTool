let bedSizeX = 68.04;
let bedSizeY = 120.96;
let bedScaleX = bedSizeX / 1440;
let bedScaleY = bedSizeY / 2560;

let numLayers = 0;
let layerMeshes = [];

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
function pushVoxel(x, y, sides, height = 0.05) { //add quads to array, sides is 6 bits indicating if a voxel's side is visible
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

function createMeshFromQuads(yPos) { //create mesh from the "quads"-array
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
  sliceMesh.scale.y = sceneScale;
  sliceMesh.scale.z = sceneScale;

  scene.add(sliceMesh);

  return {
    mesh: sliceMesh,
    mat: mat
  };
}

//-------------------------------------------------------------------------------------------
// File handling.
//-------------------------------------------------------------------------------------------

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
    };

    r.readAsArrayBuffer(files[0]);
  }
}

function initSlider(fileNumLayers){
  numLayers = fileNumLayers;
  let slider = document.getElementById('layer-slider');
  slider.max = numLayers-1;
  slider.oninput = function(event) {
    for (let i = 0; i < numLayers; ++i) {
      layerMeshes[i].mesh.visible = (slider.value >= i);
    }
  }
  slider.value = numLayers;
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
  if (!layerMeshes) {
    return;
  }

  for (let i = 0; i < layerMeshes.length; ++i) {
    let ob = layerMeshes[i];

    scene.remove(ob.mesh);
    ob.mesh.geometry.dispose();
    ob.mat.dispose();
  }

  layerMeshes = [];
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
