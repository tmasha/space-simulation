import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';

// set up scene and background
var scene = new THREE.Scene();
scene.background = new THREE.CubeTextureLoader()
	.setPath("assets/skybox/")
	.load([
		'px.jpg',
		'nx.jpg',
		'py.jpg',
		'ny.jpg',
		'pz.jpg',
		'nz.jpg',
	]);

// set up camera
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 100000);
camera.position.set(0, 0, 50);

// set up renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// set up camera controls
const controls = new FlyControls(camera, renderer.domElement);
controls.movementSpeed = 100;
controls.rollSpeed = 0.2;
controls.dragToLook = true;


// converts an angle value in degrees to radians
function degToRad(number) {
	return number *= Math.PI / 180;
}

// create a representation for the orbit
// PARAMETERS
// a: semimajor axis in AU
// e: orbital eccentricity
// inclination: orbital inclination to the ecliptic in degrees
// lAN: longitude of ascending node in degrees
// aP: argument of periapsis in degrees

function createOrbit(a, e, inclination, lAN, aP) {
    
	// calculate b (semiminor axis) from a and eccentricity
	var b = a * Math.sqrt(1 - e*e); 
    
	// upscale a and b so the model isn't too compressed
	a *= 100;
	b *= 100;

	// create an ellipse curve to represent the orbit
	const curve = new THREE.EllipseCurve(
        0, 0, // x and y displacement of the orbit (should always be 0)
        a, b, // semimajor axis, semiminor axis
        0, 2 * Math.PI, // start and end angle (should always be 0 and 2pi to account for the whole ellipse)
        false, // orbit is clockwise (should always be false because planets orbit vertically)
        degToRad(aP) // rotation angle of ellipse, accounts for arg of periapsis (rotation about axis orthogonal to orbit's own plane)
    );
		
    // get some points from the curve and use them to create a BufferGeometry to construct the orbit
    const orbitPoints = curve.getPoints(50000);
    const orbitGeom = new THREE.BufferGeometry().setFromPoints(orbitPoints);

	// rotate this BufferGeometry to account for orbital inclination and longitude of ascending node
	orbitGeom.rotateX(degToRad(inclination) - (Math.PI / 2)); // rotates orbit about the x-axis by the inclination as well as a correction factor so the orbit is horizontal
	orbitGeom.rotateY(degToRad(lAN)); // rotates orbit about the y-axis by the longitude of ascending node
	
	// create a transparent white material for the orbit line render
    const orbitMat = new THREE.LineBasicMaterial({ 
		color: 0xffffff,
		transparent: true,
		opacity: 0.5
	 });

	// make a line object out of the orbit geometry and material and render it
    const orbit = new THREE.Line(orbitGeom, orbitMat);
    scene.add(orbit);
	
	// return the BufferGeometry of the orbit so we can use it to track the system's movement in the updateSystemPosition function
	return orbitGeom;
}

// sets the axial tilt of the planet (body, tilt in degrees)
function setTilt(body, tilt) {
	body.rotation.x += degToRad(tilt);
}

function createPlanet(name, radius, orbitParameters, axialTilt, ringRadii) {

	// Create the body's geometry using the body's Radius
	const geom = new THREE.SphereGeometry(radius);
	// Create a path name for the body texture image file, then use that to make a body texture
	const path = "assets/maps/" + name + ".png";
	const bodyTexture = new THREE.TextureLoader().load(path);
	// Use the body texture and body material to make a body mesh
	const mat = new THREE.MeshStandardMaterial({
		map: bodyTexture,
	});
	// creates a body and add it to the scene
	const planet = new THREE.Mesh(geom, mat);
	scene.add(planet);
	setTilt(planet, axialTilt);

	const orbit = createOrbit(
		orbitParameters.a,
		orbitParameters.e,
		orbitParameters.i,
		orbitParameters.lAN,
		orbitParameters.aP
	);

	// this if statement is run if the ring's inner and outer radii are passed in a list
	if (ringRadii) {
		
		const ring = createRing(name, ringRadii);

		// Add the ring to the pivot and set its distance from the Sun
		scene.add(ring);
		// ring.position.set(distance, 0, 0);
		ring.rotation.x += (0.5 * Math.PI) + (axialTilt * (Math.PI / 180));

		// return body, ring, and orbit
		return { planet, orbit, ring }

	}

	// If ring is not rendered, just return a body and pivot
	return { planet, orbit }
}

function createRing(bodyName, ringRadii) {
	const ringGeom = new THREE.RingGeometry(
		ringRadii.innerRadius, 
		ringRadii.outerRadius
	);
	
	// Make a path name for the ring texture image file, then use that to make a ring texture
	const ringPath = "assets/maps/" + bodyName + "Ring.png";
	const ringTexture = new THREE.TextureLoader().load(ringPath);

	// Use the ring geometry and ring material to make a ring mesh
	const ringMat = new THREE.MeshBasicMaterial({
		map: ringTexture,
		side: THREE.DoubleSide
	});
	return new THREE.Mesh(ringGeom, ringMat);
}

// Sun
const sunGeom = new THREE.SphereGeometry(5);
const sunMaterial = new THREE.MeshBasicMaterial( { color:0xffffff } );
const sun = new THREE.Mesh(sunGeom, sunMaterial);
const pointLight = new THREE.PointLight(0xffffff, 1.3, 0);

// add wanted objects to scene
scene.add(sun);
scene.add(pointLight);

// system: target system we want to move
// orbitalPeriod: orbital period in days
// rotationPeriod: rotation period in days
function updateSystemPosition(system, orbitalPeriod, rotationPeriod) {
	
	// creates accurate orbital periods
	const timeConversionFactor = ( (2 * Math.PI) / (orbitalPeriod * 86400) ) * 300;

	// gets the time elapsed
	const time = performance.now() * timeConversionFactor;

	// retrieves position info from the orbit's buffer geometry
	const position = system.orbit.getAttribute('position');

  	// calculates the index of the point on the buffer geometry at the current time
  	const pointIndex = Math.floor((time % 1) * (position.count - 1));

  	// add the x, y, and z position at the current time to a point object
	const point = new THREE.Vector3();
  	point.x = position.getX(pointIndex);
  	point.y = position.getY(pointIndex);
  	point.z = position.getZ(pointIndex);

  	// set the position of the actual body to the point on the buffer geometry
  	system.planet.position.set(point.x, point.y, point.z);
	
	// rotation of planet
	rotationPeriod = (2 * Math.PI) / rotationPeriod * 0.1;
	system.planet.rotation.y += rotationPeriod * (Math.PI / 180);

	// modify ring position as well, if the ring exists
	if (system.ring) {
		system.ring.position.set(point.x, point.y, point.z);
		system.planet.rotation.y += rotationPeriod * (Math.PI / 180);
	}
}

// name, radius, {semimajor axis, semiminor axis, inclination}, {ring inner radius, ring outer radius}
// Inner Solar System
const mercury = createPlanet("mercury", 2.4397, {a: 0.387098, e: 0.205630, i: 7.005, lAN: 48.331, aP: 29.124}, 0.034);
const venus = createPlanet("venus", 6.0518, {a: 0.723332, e: 0.006772, i: 3.39458, lAN: 76.680, aP: 54.884}, 177.36);
const earth = createPlanet("earth", 6.371, {a: 1, e: 0.0167086, i: 0, lAN: -11.26064, aP: 114.20783}, 23.44);
const mars = createPlanet("mars", 3.3895, {a: 1.52368055, e: 0.0934, i: 1.85, lAN: 49.57854, aP: 296.5}, 25.19);

// Asteroid Belt
const ceres = createPlanet("ceres", 0.4762, {a: 2.7658, e: 0.078, i: 10.607, lAN: 80.7, aP: 73.1}, 4);

const jupiter = createPlanet("jupiter", 69.911, {a: 5.2026, e: 0.0489, i: 1.303, lAN: 100.464, aP: 273.867}, 3.13);

const saturn = createPlanet("saturn", 58.232, {a: 9.5826, e: 0.0565, i: 2.485, lAN: 113.665, aP: 339.392}, 26.73, {innerRadius: 66.9, outerRadius: 136.775});
const uranus = createPlanet("uranus", 25.362, {a: 19.19126, e: 0.04717, i: 0.773, lAN: 74.006, aP: 96.998857}, 97.77);
const neptune = createPlanet("neptune", 24.622, {a: 30.07, e: 0.008678, i: 1.77, lAN: 131.783, aP: 273.187}, 28.32);

const pluto = createPlanet("pluto", 1.186, {a: 39.482, e: 0.2488, i: 17.16, lAN: 110.299, aP: 113.834}, 112.53);

/*

const eris = createBody("eris", 1.163, {a: 67.781, e: 0.4417, i: 44.05, lAN: 35.953}, 75);
const makemake = createBody("makemake", 0.715, {a: 45.7912, e: 0.155, i: 29.006, lAN: 79.380}, 10);
const haumea = createBody("haumea", 0.62, {a: 43.3351, e: 0.195, i: 28.19, lAN: 240.739}, 115);

const sedna = createBody("sedna", 0.498, {a: 76.04, b: 506.7, inclination: 11.93, lAN: 114.273}, 1);
const quaoar = createBody("quaoar", 0.555, {a: 43.39, b: 41.65, inclination: 7.99, lAN: 118.183}, 1);
const gonggong = createBody("gonggong", 0.615, {a: 82.1, b: 39.2, inclination: 30.59, lAN: 184.856}, 1);
const orcus = createBody("orcus", {a: 39.29, b: 38.54, inclination: 20.57, lAN: 70.132}, 1);

*/

// Do all animation in this function
function animate() {
    requestAnimationFrame(animate);
	controls.update(0.05);

	// Main planets 
	// name, year (days), day (days)
	updateSystemPosition(mercury, 87.97, 58.6);
	
	
	updateSystemPosition(venus, 224.70, -243);
	updateSystemPosition(earth, 365.26, 1);
	updateSystemPosition(mars, 686.98, 1.03);

	updateSystemPosition(ceres, 1682.14, 0.38);
	
	updateSystemPosition(jupiter, 4332.59, 0.41);

	
	updateSystemPosition(saturn, 10855.7, 0.44);
	updateSystemPosition(uranus, 30687.15, 0.72);
	updateSystemPosition(neptune, 60190.03, 0.67);

	// Dwarf planets
	updateSystemPosition(pluto, 90560.73, -6.4);

	/*
	updateBodyPosition(eris, 203810, 1.08);
	updateBodyPosition(makemake, 112897, 0.94);
	updateBodyPosition(haumea, 103721, 0.16);

	updateBodyPosition(sedna, 4163850, 1);
	updateBodyPosition(quaoar, 287.5, 0.736);
	updateBodyPosition(gonggong, 558.5, 1);
	updateBodyPosition(orcus, 247.2, 1);
	*/

    renderer.render(scene, camera);
}

animate();