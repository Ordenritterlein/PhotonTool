function loadFile(fileArrayBuffer, fextension){

  clear3dScene()
  
  console.log("file is being read, extension is '" + fextension + "'" );

  let outfile = null;

	let d = new DataView(fileArrayBuffer);
	switch(fextension.toLocaleLowerCase()){
  	//case "photons" : outfile = readPhotonsFile(d); break;
  	//case "photon": case "cbddlp" : outfile = readPhotonFile(d); break;
  	//case "pws" : outfile = readPwsFile(d); break;
    //case "sl1" : outfile = readSl1File(fileArrayBuffer); break;
    case "cws": outfile = cws_readFile(fileArrayBuffer); break;
	}
}


function saveByteArray(array, name, ending){
  // supply ending as a string with the ., so ".photons" or ".pws" etc.
  link = document.createElement( 'a' );
  link.style.display = 'none';
  document.body.appendChild( link );
  blob = new Blob( [ array ], { type: 'application/octet-binary' } );
  link.href = URL.createObjectURL( blob );
  link.download =  name + ending;
  link.click();
}
