var NODE_ANIMATION = {};
NODE_ANIMATION.nodeRadius = 0.2;
NODE_ANIMATION.nodeWidthSegments = 32;
NODE_ANIMATION.nodeHeightSegments = 16;
NODE_ANIMATION.deltaT = 0.025;
NODE_ANIMATION.camera = null;
NODE_ANIMATION.scene = null;
NODE_ANIMATION.renderer = null;
NODE_ANIMATION.bloomComposer = null;
NODE_ANIMATION.finalComposer = null;

NODE_ANIMATION.nodes = [];
NODE_ANIMATION.edges = { fadingIn: [], visible: [], fadingOut: [] };
NODE_ANIMATION.fadeLength = 500;
NODE_ANIMATION.nodeCount = 40;
NODE_ANIMATION.maxEdges = 100;
NODE_ANIMATION.maxWeight = 0.5;
NODE_ANIMATION.fov = 70;
NODE_ANIMATION.speed = { min: 0.5, max: 1 };
NODE_ANIMATION.size = { width: null, height: null, canvasWidth: null, canvasHeight: null };
NODE_ANIMATION.planes = { near: 0.01, far: 1000 };
NODE_ANIMATION.zPosition = 50;
NODE_ANIMATION.mouse = { x: 0, y: 0 };
NODE_ANIMATION.ENTIRE_SCENE = 0;
NODE_ANIMATION.BLOOM_SCENE = 1;


function vertexShader() {
	return `
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}
	`
}

function fragmentShader() {
	return `
		uniform sampler2D baseTexture;
		uniform sampler2D bloomTexture;
		
		varying vec2 vUv;

		void main() {
			gl_FragColor = ( texture2D( baseTexture, vUv ) + vec4( 1.0 ) * texture2D( bloomTexture, vUv ) );
		}
	`
}


// Converts an angle in degrees to radians (camera FOV is in degrees, but calculations need radians).
NODE_ANIMATION.DegreesToRadians = function(theta) {
	return Math.PI * (theta / 180);
}

NODE_ANIMATION.Resize = function(width, height) {
	let oldWidth = NODE_ANIMATION.size.width;
	let oldHeight = NODE_ANIMATION.size.height;
	
	for (let i = 0; i < NODE_ANIMATION.nodeCount; i++) {
		NODE_ANIMATION.nodes[i].x *= (width / oldWidth);
		NODE_ANIMATION.nodes[i].y *= (height / oldHeight);
	}
	
	NODE_ANIMATION.size.width = width;
	NODE_ANIMATION.size.height = height;
	
	NODE_ANIMATION.size.canvasHeight = 2 * (NODE_ANIMATION.zPosition * Math.sin(NODE_ANIMATION.DegreesToRadians(NODE_ANIMATION.fov / 2)) / Math.sin(NODE_ANIMATION.DegreesToRadians(90 - NODE_ANIMATION.fov / 2)));
	NODE_ANIMATION.size.canvasWidth = (NODE_ANIMATION.size.width / NODE_ANIMATION.size.height) * NODE_ANIMATION.size.canvasHeight;
	
	NODE_ANIMATION.camera.aspect = NODE_ANIMATION.size.width / NODE_ANIMATION.size.height;
	NODE_ANIMATION.camera.updateProjectionMatrix();
	
	NODE_ANIMATION.renderer.setSize(NODE_ANIMATION.size.width, NODE_ANIMATION.size.height);
	NODE_ANIMATION.bloomComposer.setSize(NODE_ANIMATION.size.width, NODE_ANIMATION.size.height);
	NODE_ANIMATION.finalComposer.setSize(NODE_ANIMATION.size.width, NODE_ANIMATION.size.height);

	NODE_ANIMATION.Render();
}



NODE_ANIMATION.NodeAnimation = function(width, height) {
	NODE_ANIMATION.size.width = width;
	NODE_ANIMATION.size.height = height;
	
	NODE_ANIMATION.mouse.x = NODE_ANIMATION.size.width / 2;
	NODE_ANIMATION.mouse.y = NODE_ANIMATION.size.height / 2;
	
	// Setup camera.
	NODE_ANIMATION.camera = new THREE.PerspectiveCamera(NODE_ANIMATION.fov, NODE_ANIMATION.size.width / NODE_ANIMATION.size.height, NODE_ANIMATION.planes.near, NODE_ANIMATION.planes.far);
	NODE_ANIMATION.camera.position.z = NODE_ANIMATION.zPosition;
	
	// Setup scene.
	NODE_ANIMATION.size.canvasHeight = 2 * (NODE_ANIMATION.zPosition * Math.sin(NODE_ANIMATION.DegreesToRadians(NODE_ANIMATION.fov / 2)) / Math.sin(NODE_ANIMATION.DegreesToRadians(90 - NODE_ANIMATION.fov / 2)));
	NODE_ANIMATION.size.canvasWidth = (NODE_ANIMATION.size.width / NODE_ANIMATION.size.height) * NODE_ANIMATION.size.canvasHeight;
	
	NODE_ANIMATION.scene = new THREE.Scene();
	
	// Setup renderer.
	NODE_ANIMATION.renderer = new THREE.WebGLRenderer( { antialias: true } );
	NODE_ANIMATION.renderer.setClearColor(0x000005, 1.0)
	//NODE_ANIMATION.renderer.setPixelRatio(window.devicePixelRatio); ///////////////////////////////////////////////////////////////////////////////////////////////////////////// ?
	NODE_ANIMATION.renderer.setSize(NODE_ANIMATION.size.width, NODE_ANIMATION.size.height);
	document.body.appendChild(NODE_ANIMATION.renderer.domElement);
	
	const renderScene = new THREE.RenderPass(NODE_ANIMATION.scene, NODE_ANIMATION.camera);

	const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(NODE_ANIMATION.size.width, NODE_ANIMATION.size.height), 1.5, 0.4, 0.85);
	bloomPass.threshold = 0;
	bloomPass.strength = 2;
	bloomPass.radius = 1;

	NODE_ANIMATION.bloomComposer = new THREE.EffectComposer(NODE_ANIMATION.renderer);
	NODE_ANIMATION.bloomComposer.renderToScreen = false;
	NODE_ANIMATION.bloomComposer.addPass(renderScene);
	NODE_ANIMATION.bloomComposer.addPass(bloomPass);

	const finalPass = new THREE.ShaderPass(
		new THREE.ShaderMaterial( {
			uniforms: {
				baseTexture: { value: null },
				bloomTexture: { value: NODE_ANIMATION.bloomComposer.renderTarget2.texture }
			},
			vertexShader: vertexShader(),
			fragmentShader: fragmentShader(),
			defines: {}
		} ), 'baseTexture'
	);
	finalPass.needsSwap = true;

	NODE_ANIMATION.finalComposer = new THREE.EffectComposer(NODE_ANIMATION.renderer);
	NODE_ANIMATION.finalComposer.addPass(renderScene);
	NODE_ANIMATION.finalComposer.addPass(finalPass);

	NODE_ANIMATION.SetupScene();
	
	// Start animation loop.
	NODE_ANIMATION.Animate();
}

NODE_ANIMATION.Render = function() {
	NODE_ANIMATION.camera.layers.set(NODE_ANIMATION.BLOOM_SCENE);
	NODE_ANIMATION.bloomComposer.render();
	NODE_ANIMATION.camera.layers.set(NODE_ANIMATION.ENTIRE_SCENE);
	NODE_ANIMATION.finalComposer.render();
}

NODE_ANIMATION.SetupScene = function() {
	// Create nodes.
	let x, y, z, xVel, yVel, zVel, weight, colour;
	
	for (let i = 0; i < NODE_ANIMATION.nodeCount; i++) {
		
		x = NODE_ANIMATION.size.canvasWidth * (Math.random() - 0.5) * 1.2;
		y = NODE_ANIMATION.size.canvasHeight * (Math.random() - 0.5) * 1.2;
		z = 20 * (Math.random() - 0.5);
		
		xVel = (Math.random() * 2) - 1;
		yVel = (Math.random() * 2) - 1;
		zVel = (Math.random() * 2) - 1;
		
		weight = 1; //Math.random();
		colour = Math.floor(256 * Math.random()) * 65793; // 65793 = (2^8)^0 + (2^8)^1 + (2^8)^2 which, when multiplied by an integer (0 <= x < 256), will output a greyscale colour.
		
		NODE_ANIMATION.nodes[i] = new BackgroundNode(x, y, z, xVel, yVel, zVel, weight, colour);
	}
}

NODE_ANIMATION.GetBoundaryForces = function(x, y, z) {
	// Calculate the forces to be exerted on nodes, in order to keep them mostly in frame.
	// Since the nodes all have the same weight, some constant k, we can use force and acceleration synonymously.
	let xAccel = 0;
	let yAccel = 0;
	let zAccel = 0;
	
	let xMax = (NODE_ANIMATION.size.canvasWidth / 2) * 0.8;
	let yMax = (NODE_ANIMATION.size.canvasHeight / 2) * 0.8;
	let zMax = 5;
	
	let mult = 0.01;

	
	if (x > xMax)
		xAccel = -Math.pow((xMax - x) * mult, 2);
	else if (x < -xMax)
		xAccel = Math.pow((xMax - x) * mult, 2);
	
	if (y > yMax)
		yAccel = -Math.pow((yMax - y) * mult, 2);
	else if (y < -yMax)
		yAccel = Math.pow((yMax - y) * mult, 2);
	
	if (z > zMax)
		zAccel = -Math.pow((zMax - z) * mult, 2);
	else if (z < -zMax)
		zAccel = Math.pow((zMax - z) * mult, 2);
	
	return {x: xAccel, y: yAccel, z: zAccel};
}

NODE_ANIMATION.RemoveEdges = function(chance) {
	// Iterate through all edges and remove some of them.
	toRemove = [];
	
	for (let k = 0; k < NODE_ANIMATION.edges.visible.length; k++) {
		if (Math.random() < chance) {
			toRemove.push(k);
		}
	}
	
	for (let i = 0; i < toRemove.length; i++) {
		NODE_ANIMATION.edges.fadingOut.push(NODE_ANIMATION.edges.visible.splice(toRemove.pop(), 1)[0])
	}
}

NODE_ANIMATION.LineInEdges = function(lines, nodeA, nodeB) {
	// Go through all edges and return true if the passed nodes are in it.
	for (let k = 0; k < lines.length; k++) {
		if (lines[k].hasNode(nodeA)  && lines[k].hasNode(nodeB)) {
			return true;
		}
	}
	
	return false;
}

NODE_ANIMATION.AddEdges = function(chance) {
	// Iterate through all nodes and add some edges to them.
	
	// If there are already the maximum number of edges, return.
	if (NODE_ANIMATION.edges.visible.length + NODE_ANIMATION.edges.fadingIn.length + NODE_ANIMATION.edges.fadingOut.length >= NODE_ANIMATION.maxEdges)
		return;
	
	
	for (let i = 0; i < NODE_ANIMATION.nodeCount - 1; i++) {
		for (let j = 1; j < NODE_ANIMATION.nodeCount; j++) {
			// For every unique tuple of nodes, if there is no pre-existing edge between them, there is a certain chance it will be added to the collection of edges to fade in.
			if (Math.random() < chance &&
					!NODE_ANIMATION.LineInEdges(NODE_ANIMATION.edges.visible, NODE_ANIMATION.nodes[i], NODE_ANIMATION.nodes[j]) &&
					!NODE_ANIMATION.LineInEdges(NODE_ANIMATION.edges.fadingIn, NODE_ANIMATION.nodes[i], NODE_ANIMATION.nodes[j]) &&
					!NODE_ANIMATION.LineInEdges(NODE_ANIMATION.edges.fadingOut, NODE_ANIMATION.nodes[i], NODE_ANIMATION.nodes[j])) {
						
				NODE_ANIMATION.edges.fadingIn.push(new BackgroundEdge(NODE_ANIMATION.nodes[i], NODE_ANIMATION.nodes[j], Math.random()));
			}
		}
	}
}

NODE_ANIMATION.UpdateNodes = function() {
	// Update and draw all node.
	for (let i = 0; i < NODE_ANIMATION.nodeCount; i++) {
		NODE_ANIMATION.nodes[i].update();
		NODE_ANIMATION.nodes[i].draw();
	}
}

NODE_ANIMATION.UpdateEdges = function() {
	// Update and draw all edges.
	for (let i = 0; i < NODE_ANIMATION.edges.visible.length; i++) {
		NODE_ANIMATION.edges.visible[i].update();
		NODE_ANIMATION.edges.visible[i].draw();
	}
}

NODE_ANIMATION.UpdateFadeInEdges = function() {
	let fadedIn = []
	
	// Iterate through all fadeInEdges and, if it has been faded in fully, add its index to a stack.
	for (let i = 0; i < NODE_ANIMATION.edges.fadingIn.length; i++) {
		// Update and draw all fadeInEdges.
		NODE_ANIMATION.edges.fadingIn[i].update();
		NODE_ANIMATION.edges.fadingIn[i].draw();
		
		// Check if the edge has fully faded in.
		if (NODE_ANIMATION.edges.fadingIn[i].fadeIn()) {
			fadedIn.push(i);
		}
	}
	
	// Use the stack to get all indices to remove in reverse order (as FIFO would change the indices of the next edge to be removed).
	// Add the edge to edges.
	for (let i = 0; i < fadedIn.length; i++) {
		NODE_ANIMATION.edges.visible.push(NODE_ANIMATION.edges.fadingIn.splice(fadedIn.pop(), 1)[0])
	}
}

NODE_ANIMATION.UpdateFadeOutEdges = function() {
	let fadedOut = []
	
	// Iterate through all fadeOutEdges and, if it has been faded out fully, add its index to a stack.
	for (let i = 0; i < NODE_ANIMATION.edges.fadingOut.length; i++) {
		// Update and draw all fadeOutEdges.
		NODE_ANIMATION.edges.fadingOut[i].update();
		NODE_ANIMATION.edges.fadingOut[i].draw();
		
		// Check if the edge has fully faded out.
		if (NODE_ANIMATION.edges.fadingOut[i].fadeOut()) {
			fadedOut.push(i);
		}
	}
	
	// Use the stack to get all indices to remove in reverse order (as FIFO would change the indices of the next edge to be removed).
	// Destroy the removed edge (to prevent it remaining in the scene).
	for (let i = 0; i < fadedOut.length; i++) {
		NODE_ANIMATION.edges.fadingOut.splice(fadedOut.pop(), 1)[0].destroy();
	}
}

NODE_ANIMATION.Animate = function() {
	requestAnimationFrame(NODE_ANIMATION.Animate);
	
	let perFrameRem = 0.2;
	let perFrameAdd = 0.3;
	
	
	// Slightly rotate the camera as the mouse moves.
	NODE_ANIMATION.camera.rotation.x = THREE.MathUtils.lerp(NODE_ANIMATION.camera.rotation.x, ((NODE_ANIMATION.mouse.y - NODE_ANIMATION.size.height / 2) * Math.PI) / 100000, 0.1);
	NODE_ANIMATION.camera.rotation.y = THREE.MathUtils.lerp(NODE_ANIMATION.camera.rotation.y, ((NODE_ANIMATION.mouse.x - NODE_ANIMATION.size.width / 2) * Math.PI) / 100000, 0.1);

	// Update and draw all nodes and edges.
	let chanceRem = perFrameRem / NODE_ANIMATION.maxEdges;
	let chanceAdd = perFrameAdd / ((NODE_ANIMATION.nodeCount - 1) * (NODE_ANIMATION.nodeCount - 1));
	
	NODE_ANIMATION.RemoveEdges(chanceRem); // On average, k * 0.001 edges (where k = maxEdges) will be removed (0.2) per frame.
	NODE_ANIMATION.AddEdges(chanceAdd); // On average, (n-1) * (n-1) * 0.00005 edges will be added (where n = nodeCount) will be added (0.31) per frame - assuming not already at maximum edges.
	
	NODE_ANIMATION.UpdateNodes();
	NODE_ANIMATION.UpdateEdges();
	NODE_ANIMATION.UpdateFadeInEdges();
	NODE_ANIMATION.UpdateFadeOutEdges();

	NODE_ANIMATION.renderer.render(NODE_ANIMATION.scene, NODE_ANIMATION.camera);
	NODE_ANIMATION.Render();
}

NODE_ANIMATION.UpdateMouse = function(x, y) {
	NODE_ANIMATION.mouse.x = x;
	NODE_ANIMATION.mouse.y = y;
}


class BackgroundNode {
	constructor(x, y, z, xVel, yVel, zVel, weight, colour) {
		// The x, y and z starting positions should only slightly extend off of the screen.
		// The weight of the node represents its' brightness and the brightness of any edges connected to it.
		// The colour of the node should be a bluish-white.
		this.x = x;
		this.y = y;
		this.z = z;
		
		this.xVel = xVel;
		this.yVel = yVel;
		this.zVel = zVel;
		
		this.weight = weight;
		this.colour = colour;
		
		// Create a sphere mesh.
		var nodeGeometry = new THREE.SphereGeometry(NODE_ANIMATION.nodeRadius, NODE_ANIMATION.nodeWidthSegments, NODE_ANIMATION.nodeHeightSegments)
		var nodeMaterial = new THREE.MeshBasicMaterial( { color: colour, transparent : true, opacity : this.weight * NODE_ANIMATION.maxWeight } );
		
		this.node = new THREE.Mesh(nodeGeometry, nodeMaterial);
		this.node.layers.enable(NODE_ANIMATION.BLOOM_SCENE);
		
		NODE_ANIMATION.scene.add(this.node);
	}
	
	update() {
		// Calculate the new velocities and positions.
		let forces = NODE_ANIMATION.GetBoundaryForces(this.x, this.y, this.z);

		
		// v = u + at.
		let xVelNew = this.xVel + forces.x * NODE_ANIMATION.deltaT;
		let yVelNew = this.yVel + forces.y * NODE_ANIMATION.deltaT;
		let zVelNew = this.zVel + forces.z * NODE_ANIMATION.deltaT;
		
		
		// Bound the node speed.
		let k;
		let speed = Math.sqrt(xVelNew * xVelNew + yVelNew * yVelNew + zVelNew * zVelNew);
		
		if (speed > NODE_ANIMATION.speed.max) {
			k = NODE_ANIMATION.speed.max / speed;
			
			xVelNew = xVelNew * k;
			yVelNew = yVelNew * k;
			zVelNew = zVelNew * k;
		} else if (speed < NODE_ANIMATION.speed.min) {
			k = NODE_ANIMATION.speed.min / speed;
			
			xVelNew = xVelNew * k;
			yVelNew = yVelNew * k;
			zVelNew = zVelNew * k;
		}
		
		// s = (u + v)t / 2.
		let newX = this.x + (this.xVel + xVelNew) * NODE_ANIMATION.deltaT / 2;
		let newY = this.y + (this.yVel + yVelNew) * NODE_ANIMATION.deltaT / 2;
		let newZ = this.z + (this.zVel + zVelNew) * NODE_ANIMATION.deltaT / 2;
		
		
		// Set the current velocity as the new velocity.
		this.xVel = xVelNew;
		this.yVel = yVelNew;
		this.zVel = zVelNew;

		// Set the current position as the new position.
		this.x = newX;
		this.y = newY;
		this.z = newZ;
	}
	
	draw() {
		// Draw the node.
		this.node.position.set(this.x, this.y, this.z);
	}
	
	destroy() {
		// Remove the node from the scene.
		NODE_ANIMATION.scene.remove(this.node);
	}
}


class BackgroundEdge {
	constructor(nodeA, nodeB, weight) {
		// Connect two nodes with a weighted edge (the weight will also depend upon the average weighting of the two nodes).
		
		// An edge is a line between two nodes.
		this.nodeA = nodeA;
		this.nodeB = nodeB;
		
		this.fadeValue = NODE_ANIMATION.fadeLength;
		
		// The weight of the edge is the average weight of both nodes, multiplied by the passed weight.
		this.maxOpacity = NODE_ANIMATION.maxWeight * weight * (this.nodeA.weight + this.nodeB.weight) / 2;
		
		// The colour of the edge is the average colour of both nodes.
		let c = ((this.nodeA.colour / 65793) + (this.nodeB.colour / 65793)) / 2;
		let colour = Math.floor(c) * 65793;
		
		// Create the line.
		this.lineGeometry = new THREE.BufferGeometry();
		this.lineMaterial = new THREE.LineBasicMaterial( { color : colour, transparent : true, opacity : 0 } );
		
		this.lineData = new Float32Array(6);
		this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.lineData, 3));
		
		this.line = new THREE.Line(this.lineGeometry, this.lineMaterial);
		this.line.layers.enable(NODE_ANIMATION.BLOOM_SCENE);
		
		NODE_ANIMATION.scene.add(this.line);
	}
	
	hasNode(node) {
		if (node == this.nodeA || node == this.nodeB)
			return true;
		
		return false;
	}
	
	update() {
		// Update the start and end positions of the line using the node positions.
		this.lineData[0] = this.nodeA.x;
		this.lineData[1] = this.nodeA.y;
		this.lineData[2] = this.nodeA.z;
		this.lineData[3] = this.nodeB.x;
		this.lineData[4] = this.nodeB.y;
		this.lineData[5] = this.nodeB.z;
	}
	
	draw() {
		// Draw the line.
		this.lineGeometry.setDrawRange(0, 6);
		this.lineGeometry.attributes.position.needsUpdate = true;
	}
	
	destroy() {
		// Remove the line from the scene.
		NODE_ANIMATION.scene.remove(this.line);
	}
	
	fadeIn() {
		// Fade the line in (opacity 0 to maximum).
		this.lineMaterial.opacity = this.maxOpacity * (NODE_ANIMATION.fadeLength - this.fadeValue) / NODE_ANIMATION.fadeLength;
		
		this.fadeValue -= 1;
		
		// If the node has finished fading in, return true.
		if (this.fadeValue <= 0) {
			this.fadeValue = 0;
			this.lineMaterial.opacity = this.maxOpacity;
			return true;
		}
		
		return false;
	}
	
	fadeOut() {
		// Fade the line out (opacity maximum to 0).
		this.lineMaterial.opacity = this.maxOpacity * (NODE_ANIMATION.fadeLength - this.fadeValue) / NODE_ANIMATION.fadeLength;
		
		this.fadeValue += 1;
		
		// If the node has finished fading out, return true.
		if (this.fadeValue >= NODE_ANIMATION.fadeLength) {
			this.count = NODE_ANIMATION.fadeLength;
			this.lineMaterial.opacity = 0;
			return true;
		}
		
		return false;
	}
}