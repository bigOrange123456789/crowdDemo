function MyPMLoader(url,LODArray,camera,animationType,animationSpeed){
    this.constructor= THREE.PMLoader;
    this.mytest=0;
    this.pmMeshHistory=[];
    this.preLODIndex=-1;
    this.rootObject=new THREE.Object3D();
    this.mesh={};
    //hadLoadAllMesh:false,
    this.LODNumber=3;//LOD的层级划分数量，默认为3
    this.LODArray=[];
    this.camera=null;
    this.skeletonBones=null;
    this.skeletonMatrix=null;
    //this.scene=scene;//window中含有scene对象//appInst._renderScenePass.scene;//0000
    //console.log(this.scene);

    this.updateMesh=function(i,skeletonBones,skeletonMatrix){//这个函数的作用是协助实现LOD//0 - pmMeshHistory-1
        if(this.preLODIndex===i||i>=this.pmMeshHistory.length||i<0){this.preLODIndex=i;return;}
        this.preLODIndex=i;
        if(!this.pmMeshHistory[i].parent){
            //this.animationMixer=new THREE.AnimationMixer(this.rootObject);//

            this.rootObject.add(this.pmMeshHistory[i]);
            this.rootObject.remove(this.mesh[0]);

            this.mesh[0]=this.pmMeshHistory[i];//console.log(this.pmMeshHistory);

            var skinnedMesh =this.rootObject.children[0];
            skinnedMesh.add(skeletonBones.bones[0]);
            skinnedMesh.bind(skeletonBones,skeletonMatrix);
        }
    }
    /*updateMesh:function(i){//这个函数的作用是协助实现LOD//0 - pmMeshHistory-1
        if(this.preLODIndex===i||i>=this.pmMeshHistory.length||i<0){this.preLODIndex=i;return;}
        this.preLODIndex=i;
        if(!this.pmMeshHistory[i].parent){
            //this.animationMixer=new THREE.AnimationMixer(this.rootObject);//
            this.rootObject.remove(this.mesh[0]);
            this.rootObject.add(this.pmMeshHistory[i]);

            this.mesh[0]=this.pmMeshHistory[i];//console.log(this.pmMeshHistory);
            //console.log(this.rootObject);
            //this.animationMixers[0].play();
            console.log(this);
        }
    },*/

    //外界只需要执行下面的这个load函数
    this.load=function(url,LODArray,camera, onLoad, onProgress, onError)
    {
        this.camera=camera;
        this.preLODIndex=LODArray.length;
        this.LODNumber=LODArray.length+1;

        var THIS = this;
        this.url = url;

        var baseMeshUrl = url + '/basemesh.json';
        var skeletonUrl = url + '/skeleton.json';
        var skeletonIndexUrl = url + '/skeletonindex.json';

        var pmSkeletonBones  =this.skeletonBones;
        var pmSkeletonMatrix =this.smSkeletonMatrix;

        //async function f(callback){return await callback(x,y);}
        var animLoader = new PMAnimLoader();//估计是通过gltf文件加载的动画
        //console.log(animLoader);
        animLoader.load(url + '/gltf/scene.gltf', function (gltfScene)
            //animLoader.load(url + '/gltf/zhaotest.glb', function (gltfScene)
        {
            function loopAnimationRun(){
                requestAnimationFrame(loopAnimationRun);
                THIS.animationRun();
            }loopAnimationRun();
            //加载完gltf模型后在进行骨骼动画的处理
            var animationClips=gltfScene.animations;
            var gltfModel     =gltfScene.scene;
            gltfModel.traverse( function(node)
            {
                if (node instanceof THREE.Mesh&&!pmSkeletonBones)//node是THREE.Mesh类型的实例，且pmSkeletonBones为空
                {
                    var bones = [];
                    cloneBones(node.skeleton.bones[0], bones);
                    THIS.skeletonBones=pmSkeletonBones= new THREE.Skeleton(bones, node.skeleton.boneInverses);
                    THIS.skeletonMatrix=pmSkeletonMatrix =  node.matrixWorld.clone();
                    //console.log(THIS);
                }
            });
            //加载完基模后再进行解析，执行parse函数
            var baseMeshloader = new THREE.XHRLoader(THIS.manager);
            baseMeshloader.load(baseMeshUrl, function(baseMesh)
            {
                var skeletonLoader = new THREE.XHRLoader(THIS.manager);
                skeletonLoader.load(skeletonUrl, function(skeleton)
                {
                    var skeletonIndexLoader = new THREE.XHRLoader(THIS.manager);
                    skeletonIndexLoader.load(skeletonIndexUrl, function(skeletonIndex)
                    {
                        onLoad(THIS.parse(url, baseMesh, skeleton, skeletonIndex, pmSkeletonBones, pmSkeletonMatrix, animationClips));
                    });
                });
            });
        });

        function cloneBones(rootBone, boneArray)//用于加载完gltf文件后的骨骼动画的处理
        {
            var rootBoneClone = rootBone.clone();
            rootBoneClone.children.splice(0, rootBoneClone.children.length);
            boneArray.push(rootBoneClone);
            for (var i = 0 ; i < rootBone.children.length ; ++i)
                rootBoneClone.add(cloneBones(rootBone.children[i], boneArray));
            return rootBoneClone;
        }
    }
    this.parse=function(url, baseMesh, skeleton, skeletonIndex, skeletonBones , skeletonMatrix, animationClips)
    {//parse的意思是解析，只被load函数调用一次
        var rootObject =this.rootObject ;// new THREE.Object3D();

        var pmFilesUrl = url + '/pm/';
        var texFilesUrl = url;

        var isPmLoading = true;
        var pmDeltaTime =0;// isPmLoading ? 500 : 5;

        var meshMat = {};
        var pmCount = 0;//PM的json文件总个数
        var splitCount = 0;//已加载的json文件总个数

        var incidentFaces = {};
        var meshData = {vertices:[] ,faces:[] ,uvs:[] ,materials:[] ,Uvfaces:[], joints:[], weights:[]};
        var mapMaterial={};

        var jsonData = JSON.parse(baseMesh);
        var skeletonData = JSON.parse(skeleton);
        var skeletonIndexData = JSON.parse(skeletonIndex);

        var material_id=0;
        var mesh=this.mesh;

        var meshMaterialMap = {};

        var imageLodLevel = 0;

        var MaxLODLevel = 5;//var imgLoadingGapTime = 1200;var pmLoadingTimeout = 50;

        var pmMeshHistory=this.pmMeshHistory;//[];
        var numberLOD=this.LODNumber;

        for (var i = 0 ; i < jsonData.geometries[0].data.vertices.length / 3 ; ++i)
            meshData.vertices.push([
                jsonData.geometries[0].data.vertices[i * 3 + 0] ,
                jsonData.geometries[0].data.vertices[i * 3 + 1] ,
                jsonData.geometries[0].data.vertices[i * 3 + 2]
            ]);


        for (var i = 0 ; i < jsonData.geometries[0].data.vertices.length / 3 ; ++i)
        {
            var skeletonId = skeletonIndexData[i];
            meshData.joints.push(skeletonData.joints[skeletonId]);
            meshData.weights.push(skeletonData.weights[skeletonId]);
        }
        for(var i = 0 ; i < jsonData.geometries[0].data.uvs.length / 2 ; ++i)
        {
            meshData.uvs.push([
                jsonData.geometries[0].data.uvs[i * 2 + 0] ,
                jsonData.geometries[0].data.uvs[i * 2 + 1]
            ]);
        }
        for(var i = 0 ; i < jsonData.geometries[0].data.faces.length; ++i)
        {
            if(jsonData.geometries[0].data.faces[i].length>0)
            {
                mapMaterial[i]=material_id;
                meshData.materials.push(jsonData.geometries[0].data.materials[i]);
                var tmpfaces=[];
                var tmpUvfaces=[];
                for (var j = 0 ; j < jsonData.geometries[0].data.faces[i].length / 3 ; ++j)
                {
                    tmpfaces.push([
                        jsonData.geometries[0].data.faces[i][j * 3 + 0] ,
                        jsonData.geometries[0].data.faces[i][j * 3 + 1] ,
                        jsonData.geometries[0].data.faces[i][j * 3 + 2]
                    ]);
                    tmpUvfaces.push([
                        jsonData.geometries[0].data.Uvfaces[i][j*3+0],
                        jsonData.geometries[0].data.Uvfaces[i][j*3+1],
                        jsonData.geometries[0].data.Uvfaces[i][j*3+2]
                    ]);
                }
                meshData.faces.push(tmpfaces);
                meshData.Uvfaces.push(tmpUvfaces);
                material_id++;
            }
        }

        computeIncidentFaces();
        computeBoundingBox();

        for(var i=0; i< meshData.materials.length;i++)
        {
            meshMat[i] = new THREE.MeshStandardMaterial(
                {
                    metalness : 0.2,
                    roughness : 0.8,
                    map: null,//THREE.ImageUtils.loadTexture(texFilesUrl + '/' + meshData.materials[i]),
                    transparent: false,
                    opacity : true,
                    skinning : true
                });
            startLogImageLoading(meshMat[i], meshData.materials[i]);
        }

        for(var Meshid=0;Meshid < meshData.faces.length;Meshid++){//meshData.faces.length为1
            restoreMesh(Meshid);//应该是处理基模时使用的，只被执行一次
            //console.log(6,rootObject.position);
        }
        //console.log(7,rootObject.position);

        var THIS=this;
        loadLocalFile(pmFilesUrl + 'desc.json',function (data)
        {
            //console.log(10,rootObject.position);
            var jsonData = JSON.parse(data);
            splitCount = jsonData.splitCount;
            startPmLoading(THIS);
        });


        rootObject.animations=animationClips;//animationClips是AnimationClip数组类型的，存放了5个动画//animationClips里面有多个动作，动作的切换是可行的//animationClips[0]=animationClips[1];//Clip是削减的意思
        return rootObject;//程序到此执行结束，以下为工具函数

        /***************************************************************************************************************/
        function startLogImageLoading(srcMtl , imgFile)
        {
            if (!srcMtl || !imgFile) return;

            var imgFileNameWithoutEx = imgFile.substring(0, imgFile.lastIndexOf('.'));
            var imgFileExtension = imgFile.substring(imgFile.lastIndexOf('.') + 1 , imgFile.length);

            meshMaterialMap[imgFileNameWithoutEx] = srcMtl;

            loadLodImage(imgFileNameWithoutEx, imgFileExtension);
        }

        function loadLodImage(imageFileNameWithoutEx, imageFileExtension, isSrcImage)
        {
            var imgUrl = texFilesUrl + '/' + imageFileNameWithoutEx + (isSrcImage ? '' : ('_' + imageLodLevel)) + '.' + imageFileExtension;

            var loader = new THREE.TextureLoader();
            loader.load(imgUrl, function ( texture )
                {
                    var lodImgName = texture.image.src.substring(texture.image.src.lastIndexOf('/') + 1, texture.image.src.length);
                    var srcImgName = isSrcImage ? lodImgName.substring(0, lodImgName.lastIndexOf('.')) : lodImgName.substring(0, lodImgName.lastIndexOf('_'));

                    if(meshMaterialMap[srcImgName])
                    {
                        meshMaterialMap[srcImgName].map = texture;
                        meshMaterialMap[srcImgName].needsUpdate = true;
                    }

                    imageLodLevel++;

                    if (!isSrcImage && imageLodLevel <= MaxLODLevel)//setTimeout(function(){} , imgLoadingGapTime);
                        loadLodImage(imageFileNameWithoutEx, imageFileExtension, imageLodLevel == MaxLODLevel);
                },
                undefined,
                function ( err )
                {
                    loadLodImage(imageFileNameWithoutEx, imageFileExtension, true);
                });
        }

        function setupPmSkinnedMesh(rootObject, skeletonBones , skeletonMatrix)
        {
            var skinnedMesh = rootObject.children[0];
            skinnedMesh.add(skeletonBones.bones[0]);
            skinnedMesh.bind(skeletonBones,skeletonMatrix);
        }

        function loadLocalFile(fileName , loadCallback)
        {
            //console.log(8,rootObject.position);
            var xmlhttp = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP");
            //console.log(8.1,rootObject.position);
            /*var posX=rootObject.position.x;
            var posY=rootObject.position.y;
            var posZ=rootObject.position.z;
            var scaleX=rootObject.scale.x;
            var scaleY=rootObject.scale.y;
            var scaleZ=rootObject.scale.z;*/
            xmlhttp.onreadystatechange = function ()//第二次执行这个函数时rootObject.position被改变//存有 XMLHttpRequest 的状态。从 0 到 4 发生变化
            {
                //console.log(8.2,rootObject.position);
                if (xmlhttp.readyState == 4 && xmlhttp.status == 200)
                    if (loadCallback){
                        //rootObject.position.set(posX,posY,posZ);
                        //rootObject.scale.set(scaleX,scaleY,scaleZ);
                        //console.log(9,rootObject.position);
                        loadCallback(xmlhttp.responseText);
                    }
            }
            xmlhttp.open("GET", fileName, true);
            xmlhttp.send();
        }

        function computeIncidentFaces()
        {
            for (var i = 0 ; i < meshData.vertices.length ; ++i)
                incidentFaces[i] = [];
            for (var fi=0;fi<meshData.faces.length;fi++)
                for (var vi = 0 ; vi < meshData.faces[fi].length ; ++vi)
                    for(var faceIndex=0;faceIndex<3;faceIndex++)
                        incidentFaces[meshData.faces[fi][vi][faceIndex]].push(vi);
        }

        function computeBoundingBox()
        {
            var minX = 99999.0 , maxX = -99999.0 , minY = 99999.0 , maxY = -99999.0 , minZ = 99999.0 , maxZ = -99999.0;
            for (var i = 0 ; i < meshData.vertices.length ; ++i)
            {
                minX = Math.min(minX , meshData.vertices[i][0]);
                maxX = Math.max(maxX , meshData.vertices[i][0]);

                minY = Math.min(minY , meshData.vertices[i][1]);
                maxY = Math.max(maxY , meshData.vertices[i][1]);

                minZ = Math.min(minZ , meshData.vertices[i][2]);
                maxZ = Math.max(maxZ , meshData.vertices[i][2]);
            }

            meshData.bbox =
                {
                    min : {x : minX , y : minY , z : minZ} ,
                    max : {x : maxX , y : maxY , z : maxZ} ,
                    center : {x : (minX + maxX) * 0.5 , y : (minY + maxY) * 0.5 , z : (minZ + maxZ) * 0.5}
                };
        }

        function isOriginalFaceOfT(tIndex ,objectF,Meshid, face , vsData)
        {
            for (var vsfi = 0 ; vsfi < vsData.Faces.length ; vsfi+=6)
            {
                var index = -1;
                var isFace = true;


                for (var i = 0 ; i < 3 ; ++i)
                {
                    if(vsData.Faces[vsfi+2*i] == meshData.faces[Meshid][face][i])
                    {
                        objectF.faceSIndex=(vsfi/6);
                    }
                    if (vsData.Faces[vsfi+2*i] == tIndex && meshData.faces[Meshid][face][i]== vsData.S)
                    {
                        index = i;
                        objectF.faceIndex=(vsfi/6);
                    }
                    else if (vsData.Faces[vsfi+2*i] != meshData.faces[Meshid][face][i])
                    {
                        isFace = false;
                    }
                }

                if (isFace)
                {
                    return index;
                }
            }
            return -1;
        }

        //pm的json文件内的每一段都需要这函数的处理
        function restoreVertexSplit(si,vsData)//si是段号（数组下标）,vsData是一段（数组中的一个元素）
        {
            var Meshid=mapMaterial[vsData.FacesMaterial[0]];

            //段中的S是要修改的点，SPosition是改动后的位置
            meshData.vertices[vsData.S][0] = vsData.SPosition[0];
            meshData.vertices[vsData.S][1] = vsData.SPosition[1];
            meshData.vertices[vsData.S][2] = vsData.SPosition[2];

            for(var i=0;i<vsData.UVs.length/2;i++)
                meshData.uvs.push([vsData.UVs[2*i+0],vsData.UVs[2*i+1]]);

            //段中的TPosition是要添加的点
            meshData.vertices.push([vsData.TPosition[0] , vsData.TPosition[1] , vsData.TPosition[2]]);

            meshData.joints.push(skeletonData.joints[vsData.T]);
            meshData.weights.push(skeletonData.weights[vsData.T]);

            var t = meshData.vertices.length - 1;
            incidentFaces[t] = [];

            var newFacesOfS = [];
            var addnum=0;
            for (var fosi = 0 ; fosi < incidentFaces[vsData.S].length ; ++fosi)
            {
                var bufferIndex=incidentFaces[vsData.S][fosi];
                var objectF={faceIndex:0,faceSIndex:0};
                var c = isOriginalFaceOfT(t,objectF,Meshid,bufferIndex,vsData);

                if (c < 0)
                {
                    var faceIndexS=objectF.faceSIndex;
                    newFacesOfS.push(bufferIndex);
                    var newfUVs=[
                        vsData.Faces[faceIndexS*6+1],
                        vsData.Faces[faceIndexS*6+3],
                        vsData.Faces[faceIndexS*6+5]
                    ];
                    meshData.Uvfaces[Meshid][bufferIndex]=newfUVs;
                    continue;
                }
                addnum++;
                meshData.faces[Meshid][bufferIndex][c]=t;
                incidentFaces[t].push(bufferIndex);
                var faceIndex=objectF.faceIndex;
                var newfUV=[
                    vsData.Faces[faceIndex*6+1],
                    vsData.Faces[faceIndex*6+3],
                    vsData.Faces[faceIndex*6+5]
                ];
                meshData.Uvfaces[Meshid][bufferIndex]=newfUV;
            }
            incidentFaces[vsData.S] = newFacesOfS;

            for (var sfi = 0 ; sfi < vsData.Faces.length ; sfi+=6)
            {
                var hasST;
                if(vsData.Faces[sfi+0] == vsData.S){hasST=(vsData.Faces[sfi+2] ==t ||vsData.Faces[sfi+4] == t)}
                else if(vsData.Faces[sfi+2] == vsData.S){hasST=(vsData.Faces[sfi+0] ==t ||vsData.Faces[sfi+4] == t)}
                else if(vsData.Faces[sfi+4] == vsData.S){hasST=(vsData.Faces[sfi+0] ==t ||vsData.Faces[sfi+2] == t)}
                else{hasST=false;}

                if (!hasST)continue;

                var newFace=[vsData.Faces[sfi+0] , vsData.Faces[sfi+2] , vsData.Faces[sfi+4]];
                var index=(sfi/6);
                var iUV=[vsData.Faces[index*6+1],vsData.Faces[index*6+3],vsData.Faces[index*6+5]];
                var num=meshData.faces[Meshid].length;
                meshData.Uvfaces[Meshid].push(iUV);
                meshData.faces[Meshid].push(newFace);

                // Update incident faces
                for (var i = 0 ; i < newFace.length ; ++i)
                    incidentFaces[newFace[i]].push(num);
            }
        }

        //每加载一个PM的json文件执行一次，被调用总次数是PM的json文件个数//只被loadPmMesh函数调用
        function pmRestore(pmData,index,lengthindex)
        {
            var mapPM={};
            for (var si = 0 ; si < pmData.length ; ++si)
            {
                var id=mapMaterial[pmData[si].FacesMaterial[0]];
                mapPM[id]=true;
                restoreVertexSplit(si,pmData[si]);//还原模型
            }
            if (isPmLoading)
            {
                for(var key in mapPM)
                {
                    restoreMesh(key,index,lengthindex);//从第二个JSON文件开始执行这个语句
                }
            }
        }

        //创建新的模型，将还原后的结果渲染到场景中
        function restoreMesh(Meshid,index,lengthindex)//Meshid始终为0
        {//index:0-330   lengthindex:331
            var useSkinning = true;
            rootObject.remove(mesh[Meshid]);//将mesh从对象中移除//this is a tag 0000

            var pos=rootObject.position;
            var scale=rootObject.scale;
            var geometry=new THREE.BufferGeometry();
            updateGeometry(geometry,meshData,Meshid);//相关运算

            if(useSkinning==false){//没有骨骼动画
                mesh[Meshid]=new THREE.Mesh(geometry,meshMat[Meshid]);
            }else{//有骨骼动画
                mesh[Meshid]=new THREE.SkinnedMesh(geometry,meshMat[Meshid]);
                meshMat[Meshid].skinning=true;
            }//console.log(Meshid);输出了356次的0

            rootObject.add(mesh[Meshid]);//将新的mesh添加到对象中//

            rootObject.position=pos;
            rootObject.scale=scale;
            setupPmSkinnedMesh(rootObject, skeletonBones, skeletonMatrix);//重要

            if(typeof(index)!='undefined')
                if(index==lengthindex-1||index%Math.ceil(lengthindex/(numberLOD-1))==0)
                    pmMeshHistory.push(mesh[Meshid]);//记录mesh
            /*if(index==0){//开启实例化渲染的代码后用于实例化的那个模型骨骼绑定出现了问题
                var scene=this.scene;//window中含有scene对象

                 geometry.computeVertexNormals();//计算顶点法线
                 //console.log(geometry);
                 geometry.scale( 0.5, 0.5, 0.5 );
                 var material=new THREE.MeshNormalMaterial();
                 var mesh2=new THREE.InstancedMesh( geometry, material,2);
                 var dummy=new THREE.Object3D();
                 dummy.position.set(5,-1,0);
                 dummy.updateMatrix();//由位置计算齐次坐标变换矩阵
                 mesh2.setMatrixAt(0, dummy.matrix);
                dummy.position.set(-5,-1,0);
                dummy.updateMatrix();
                mesh2.setMatrixAt(1, dummy.matrix);
                mesh2.instanceMatrix.needsUpdate = true;
                scene.add(mesh2);

                var loader = new THREE.BufferGeometryLoader();//BufferGeometry缓冲区几何结构
                loader.load( './instancing/suzanne_buffergeometry.json', function ( geometry ) {
                    geometry.computeVertexNormals();//计算顶点法线
                    //console.log(geometry);
                    geometry.scale( 0.5, 0.5, 0.5 );
                    var material=new THREE.MeshNormalMaterial();
                    var mesh=new THREE.InstancedMesh( geometry, material,2);
                    var dummy=new THREE.Object3D();
                    dummy.updateMatrix();//由位置计算齐次坐标变换矩阵
                    mesh.setMatrixAt(0, dummy.matrix);
                    dummy.position.set(0,1,0);
                    dummy.updateMatrix();
                    mesh.setMatrixAt(1, dummy.matrix);
                    mesh.instanceMatrix.needsUpdate = true;
                    scene.add(mesh);
                } );
            }*/
        }

        function updateGeometry(geometry, meshData, Meshid)
        {
            var verticesArray = new Float32Array(meshData.faces[Meshid].length * 3 * 3);
            var indicesArray = new Uint32Array(meshData.faces[Meshid].length * 3);
            var uvsArray = new Float32Array(meshData.faces[Meshid].length * 3*2);
            var jointArray = new Uint16Array(meshData.faces[Meshid].length * 3 * 4);
            var weightArray = new Float32Array(meshData.faces[Meshid].length * 3 * 4);

            //var f1=0;
            for (var key=0;key<meshData.faces[Meshid].length;key++)
            {
                indicesArray[key * 3 + 0]=key * 3 + 0;
                indicesArray[key * 3 + 1]=key * 3 + 1;
                indicesArray[key * 3 + 2]=key * 3 + 2;

                //position
                var fx=meshData.faces[Meshid][key][0];
                var fy=meshData.faces[Meshid][key][1];
                var fz=meshData.faces[Meshid][key][2];
                verticesArray[key*9+0]=meshData.vertices[fx][0];
                verticesArray[key*9+1]=meshData.vertices[fx][1];
                verticesArray[key*9+2]=meshData.vertices[fx][2];
                verticesArray[key*9+3]=meshData.vertices[fy][0];
                verticesArray[key*9+4]=meshData.vertices[fy][1];
                verticesArray[key*9+5]=meshData.vertices[fy][2];
                verticesArray[key*9+6]=meshData.vertices[fz][0];
                verticesArray[key*9+7]=meshData.vertices[fz][1];
                verticesArray[key*9+8]=meshData.vertices[fz][2];

                // joint
                jointArray[key * 12 + 0] = meshData.joints[fx][0];
                jointArray[key * 12 + 1] = meshData.joints[fx][1];
                jointArray[key * 12 + 2] = meshData.joints[fx][2];
                jointArray[key * 12 + 3] = meshData.joints[fx][3];
                jointArray[key * 12 + 4] = meshData.joints[fy][0];
                jointArray[key * 12 + 5] = meshData.joints[fy][1];
                jointArray[key * 12 + 6] = meshData.joints[fy][2];
                jointArray[key * 12 + 7] = meshData.joints[fy][3];
                jointArray[key * 12 + 8] = meshData.joints[fz][0];
                jointArray[key * 12 + 9] = meshData.joints[fz][1];
                jointArray[key * 12 + 10] = meshData.joints[fz][2];
                jointArray[key * 12 + 11] = meshData.joints[fz][3];

                // weight
                weightArray[key * 12 + 0] = meshData.weights[fx][0];
                weightArray[key * 12 + 1] = meshData.weights[fx][1];
                weightArray[key * 12 + 2] = meshData.weights[fx][2];
                weightArray[key * 12 + 3] = meshData.weights[fx][3];
                weightArray[key * 12 + 4] = meshData.weights[fy][0];
                weightArray[key * 12 + 5] = meshData.weights[fy][1];
                weightArray[key * 12 + 6] = meshData.weights[fy][2];
                weightArray[key * 12 + 7] = meshData.weights[fy][3];
                weightArray[key * 12 + 8] = meshData.weights[fz][0];
                weightArray[key * 12 + 9] = meshData.weights[fz][1];
                weightArray[key * 12 + 10] = meshData.weights[fz][2];
                weightArray[key * 12 + 11] = meshData.weights[fz][3];

                //uv
                uvsArray[key*6+0]=meshData.uvs[meshData.Uvfaces[Meshid][key][0]][0];
                uvsArray[key*6+1]=meshData.uvs[meshData.Uvfaces[Meshid][key][0]][1];
                uvsArray[key*6+2]=meshData.uvs[meshData.Uvfaces[Meshid][key][1]][0];
                uvsArray[key*6+3]=meshData.uvs[meshData.Uvfaces[Meshid][key][1]][1];
                uvsArray[key*6+4]=meshData.uvs[meshData.Uvfaces[Meshid][key][2]][0];
                uvsArray[key*6+5]=meshData.uvs[meshData.Uvfaces[Meshid][key][2]][1];
            }
            geometry.setIndex( new THREE.BufferAttribute(indicesArray, 1));
            geometry.addAttribute( 'position', new THREE.BufferAttribute(verticesArray , 3));
            geometry.addAttribute('uv', new THREE.BufferAttribute(uvsArray,2));
            geometry.addAttribute('skinIndex' , new THREE.BufferAttribute(jointArray , 4));
            geometry.addAttribute('skinWeight' , new THREE.BufferAttribute(weightArray , 4));

            geometry.computeVertexNormals();
            verticesArray=null;
            indicesArray=null;
            uvsArray=null;
            jointArray=null;
            weightArray=null;
            geometry.needsUpdate = true;
        }

        function startPmLoading(THIS){
            loadPmMesh(pmCount,splitCount,THIS,function()
            {
                if (pmCount < splitCount)//splitCount是总数
                {
                    if(pmDeltaTime==0)startPmLoading(THIS);//setTimeout(function(){} , pmDeltaTime);
                }
                else
                {
                    //THIS.hadLoadAllMesh=true;
                    //开始测试
                    document.onkeydown = function(e){
                        if (e.key == "N"||e.key == "n") {
                            console.log(THIS.rootObject,THIS.skeletonBones);
                            var i=prompt("请输入1-"+(pmMeshHistory.length)+"的数字来切换LOD:",0);

                            THIS.updateMesh(i-1);
                            //console.log(pmMeshHistory);//geometry
                        }else if (e.key == "M"||e.key == "m") {//在这里改变animations数组中动画的顺序并不能切换动画
                            var i=prompt("请输入1-"+(THIS.rootObject.animations.length)+"的数字来切换动画:",0);
                            THIS.updateAnimation(i-1);
                        }
                    }
                    //完成测试//if (isPmLoading == false) restoreMesh();
                    function loopLODCheck(){
                        //if(Math.random()<0.01)THIS.updateAnimation(Math.floor(Math.random()*4));
                        requestAnimationFrame(loopLODCheck);
                        THIS.LODCheck(THIS.camera,THIS.skeletonBones,THIS.skeletonMatrix);
                    }loopLODCheck();/**/
                    console.log('already loaded all PM file!');
                }
            });
            pmCount++;
        }

        //加载一个PM的json文件
        function loadPmMesh(index,lengthindex,THIS, callback)
        {
            loadLocalFile(pmFilesUrl + '/pmmesh' + index + '.json', function (data)
            {
                var pmData = JSON.parse(data);
                pmRestore(pmData,index,lengthindex);
                if (callback) callback();
            });
        }
    }
    ///////////////////////////////////////////////////////////////////////
    this.camera=camera;
    this.obj=new THREE.Object3D();
    this.test=0;
    this.manager=THREE.DefaultLoadingManager;
    //以上这两个变量的左右暂时不明
    this.LODArray=LODArray;
    this.animationMixer;
    this.animationMixers=[];
    this.animationSpeed=animationSpeed;
    this.init=function(url){
        var THIS=this;
        this.load(url,this.LODArray, this.camera,function (myObject3D) {//这里得到的myObject3D就是this.rootObject
            //开始设置动画//进行这个动画设置的时候可能还只是一个基模
            THIS.animationMixer=new THREE.AnimationMixer(myObject3D);//动画混合器animationMixer是用于场景中特定对象的动画的播放器
            THIS.animationMixer.clipAction(myObject3D.animations[animationType]).play();//动画剪辑AnimationClip是一个可重用的关键帧轨道集，它代表动画。
            //完成设置动画
            for(var k=0;k<myObject3D.animations.length;k++)
                THIS.animationMixers.push(
                    THIS.animationMixer.clipAction(myObject3D.animations[k])
                );
            THIS.obj.add(THIS.rootObject);
        });
    }
    this.init(url);
    this.LODCheck=function(camera,skeletonBones,skeletonMatrix){
        var distance=Math.sqrt(
            Math.pow(camera.position.x - this.rootObject.position.x,2)
            + Math.pow(camera.position.y - this.rootObject.position.y,2)
            + Math.pow(camera.position.z - this.rootObject.position.z,2)
        );
        var level=this.LODArray.length;//分几段就有几个等级，级别编号从0开始
        if(distance<this.LODArray[0])level=0;
        for(var i=1;i<this.LODArray.length;i++)
            if(distance>this.LODArray[i-1]&&distance<this.LODArray[i]){
                level=i;
            }
        this.updateMesh(this.LODArray.length-level,skeletonBones,skeletonMatrix);//数组的下标0-(l+1)
        return level;
    }
    this.animationRun=function(){
        if(this.animationMixer)this.animationMixer.update(this.animationSpeed);
    }
    this.updateAnimation=function(i){//这个函数可以切换动画
        this.animationMixers[i].play();
        for(var k=0;k<this.animationMixers.length;k++)
            if(k!=i)this.animationMixers[k].stop();
    }

}