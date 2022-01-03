import { useState } from 'react';
import '@kitware/vtk.js/favicon';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';

// Force DataAccessHelper to have access to various data source
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HtmlDataAccessHelper';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import '@kitware/vtk.js/IO/Core/DataAccessHelper/JSZipDataAccessHelper';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';

import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import { vec3, quat, mat4 } from 'gl-matrix';

// Load the rendering pieces we want to use (for both WebGL and WebGPU)
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import '@kitware/vtk.js/Rendering/Profiles/Glyph';

import vtkFullScreenRenderWindow from '@kitware/vtk.js/Rendering/Misc/FullScreenRenderWindow';
import vtkWidgetManager from '@kitware/vtk.js/Widgets/Core/WidgetManager';
import vtkHttpDataSetReader from '@kitware/vtk.js/IO/Core/HttpDataSetReader';
import vtkImageCroppingWidget from '@kitware/vtk.js/Widgets/Widgets3D/ImageCroppingWidget';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
// Force the loading of HttpDataAccessHelper to support gzip decompression
import '@kitware/vtk.js/IO/Core/DataAccessHelper/HttpDataAccessHelper';


let flag = 1

function App() {
    const [buttonText, setButtonText] = useState("Head/Chest");
    const changeText = (text) => setButtonText(text);
  
    const fullScreenRenderWindow = vtkFullScreenRenderWindow.newInstance({
      background: [0, 0, 0],
    });
    const renderWindow = fullScreenRenderWindow.getRenderWindow();
    const renderer = fullScreenRenderWindow.getRenderer();

    const actor = vtkActor.newInstance();
    const mapper = vtkMapper.newInstance();
    const marchingCube = vtkImageMarchingCubes.newInstance({
      contourValue: 0.0,
      computeNormals: true,
      mergePoints: true,
    });

    //CHEST______________________________________
    const apiRenderWindow = fullScreenRenderWindow.getApiSpecificRenderWindow();

    global.renderer = renderer;
    global.renderWindow = renderWindow;

    // ----------------------------------------------------------------------------
    // 2D overlay rendering
    // ----------------------------------------------------------------------------

    const overlaySize = 15;
    const overlayBorder = 2;
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.width = `${overlaySize}px`;
    overlay.style.height = `${overlaySize}px`;
    overlay.style.border = `solid ${overlayBorder}px red`;
    overlay.style.borderRadius = '50%';
    overlay.style.left = '-100px';
    overlay.style.pointerEvents = 'none';
    document.querySelector('body').appendChild(overlay);

    // ----------------------------------------------------------------------------
    // Widget manager
    // ----------------------------------------------------------------------------

    const widgetManager = vtkWidgetManager.newInstance();
    widgetManager.setRenderer(renderer);

    const widget = vtkImageCroppingWidget.newInstance();

    function widgetRegistration(e) {
        const action = e ? e.currentTarget.dataset.action : 'addWidget';
        const viewWidget = widgetManager[action](widget);
        if (viewWidget) {
            viewWidget.setDisplayCallback((coords) => {
                overlay.style.left = '-100px';
                if (coords) {
                    const [w, h] = apiRenderWindow.getSize();
                    overlay.style.left = `${Math.round(
            (coords[0][0] / w) * window.innerWidth -
              overlaySize * 0.5 -
              overlayBorder
          )}px`;
                    overlay.style.top = `${Math.round(
            ((h - coords[0][1]) / h) * window.innerHeight -
              overlaySize * 0.5 -
              overlayBorder
          )}px`;
                }
            });

            renderer.resetCamera();
            renderer.resetCameraClippingRange();
        }
        widgetManager.enablePicking();
        renderWindow.render();
    }

    // Initial widget register
    //widgetRegistration();

    // ----------------------------------------------------------------------------
    // Volume rendering
    // ----------------------------------------------------------------------------

    const reader = vtkHttpDataSetReader.newInstance({ fetchGzip: true });

    const actor2 = vtkVolume.newInstance();
    const mapper2 = vtkVolumeMapper.newInstance();
    mapper2.setSampleDistance(1.1);
    actor2.setMapper(mapper2);

    // create color and opacity transfer functions
    const ctfun = vtkColorTransferFunction.newInstance();
    ctfun.addRGBPoint(0, 85 / 255.0, 0, 0);
    ctfun.addRGBPoint(95, 1.0, 1.0, 1.0);
    ctfun.addRGBPoint(225, 0.66, 0.66, 0.5);
    ctfun.addRGBPoint(255, 0.3, 1.0, 0.5);
    const ofun = vtkPiecewiseFunction.newInstance();
    ofun.addPoint(0.0, 0.0);
    ofun.addPoint(255.0, 1.0);
    actor2.getProperty().setRGBTransferFunction(0, ctfun);
    actor2.getProperty().setScalarOpacity(0, ofun);
    actor2.getProperty().setScalarOpacityUnitDistance(0, 3.0);
    actor2.getProperty().setInterpolationTypeToLinear();
    actor2.getProperty().setUseGradientOpacity(0, true);
    actor2.getProperty().setGradientOpacityMinimumValue(0, 2);
    actor2.getProperty().setGradientOpacityMinimumOpacity(0, 0.0);
    actor2.getProperty().setGradientOpacityMaximumValue(0, 20);
    actor2.getProperty().setGradientOpacityMaximumOpacity(0, 1.0);
    actor2.getProperty().setShade(true);
    actor2.getProperty().setAmbient(0.2);
    actor2.getProperty().setDiffuse(0.7);
    actor2.getProperty().setSpecular(0.3);
    actor2.getProperty().setSpecularPower(8.0);

    mapper2.setInputConnection(reader.getOutputPort());

    // -----------------------------------------------------------
    // Get data
    // -----------------------------------------------------------

    function getCroppingPlanes(imageData, ijkPlanes) {
        const rotation = quat.create();
        mat4.getRotation(rotation, imageData.getIndexToWorld());

        const rotateVec = (vec) => {
            const out = [0, 0, 0];
            vec3.transformQuat(out, vec, rotation);
            return out;
        };

        const [iMin, iMax, jMin, jMax, kMin, kMax] = ijkPlanes;
        const origin = imageData.indexToWorld([iMin, jMin, kMin]);
        // opposite corner from origin
        const corner = imageData.indexToWorld([iMax, jMax, kMax]);
        return [
            // X min/max
            vtkPlane.newInstance({ normal: rotateVec([1, 0, 0]), origin }),
            vtkPlane.newInstance({ normal: rotateVec([-1, 0, 0]), origin: corner }),
            // Y min/max
            vtkPlane.newInstance({ normal: rotateVec([0, 1, 0]), origin }),
            vtkPlane.newInstance({ normal: rotateVec([0, -1, 0]), origin: corner }),
            // X min/max
            vtkPlane.newInstance({ normal: rotateVec([0, 0, 1]), origin }),
            vtkPlane.newInstance({ normal: rotateVec([0, 0, -1]), origin: corner }),
        ];
    }
//______________________________________________________________
    actor.setMapper(mapper);
    mapper.setInputConnection(marchingCube.getOutputPort());

    function updateIsoValue(e) {
      const isoValue = Number(e.target.value);
      marchingCube.setContourValue(isoValue);
      renderWindow.render();
    }

    //const reader = vtkHttpDataSetReader.newInstance({ fetchGzip: true });
    marchingCube.setInputConnection(reader.getOutputPort());

    function iso (){

      if (flag == 0){
        flag = 1;
        reader.setUrl(`https://kitware.github.io/vtk-js/data/volume/LIDC2.vti`).then(() => {
          reader.loadData().then(() => {
            const image = reader.getOutputData();
            
            // update crop widget
            widget.copyImageDataDescription(image);
            const cropState = widget.getWidgetState().getCroppingPlanes();
            cropState.onModified(() => {
              const planes = getCroppingPlanes(image, cropState.getPlanes());
                mapper2.removeAllClippingPlanes();
                planes.forEach((plane) => {
                  mapper2.addClippingPlane(plane);
                });
                mapper2.modified();
              });
              
              // add volume to renderer
              renderer.addVolume(actor2);
              renderer.resetCamera();
              renderer.resetCameraClippingRange();
              // Initial widget register
              widgetRegistration();
              renderWindow.render();
              //changeText("Head");
              console.log(flag)
            });
          });
      } else {
        flag = 0;
        console.log(flag)
        reader
        .setUrl(`https://kitware.github.io/vtk-js/data/volume/headsq.vti`, { loadData: true })
        .then(() => {
          const data = reader.getOutputData();
          const dataRange = data.getPointData().getScalars().getRange();
          const firstIsoValue = (dataRange[0] + dataRange[1]) / 3;
          
          const el = document.querySelector('.isoValue');
          el.setAttribute('min', dataRange[0]);
          el.setAttribute('max', dataRange[1]);
          el.setAttribute('value', firstIsoValue);
          el.addEventListener('input', updateIsoValue);
          
          marchingCube.setContourValue(firstIsoValue);
          renderer.addActor(actor);
          renderer.getActiveCamera().set({ position: [1, 1, 0], viewUp: [0, 0, -1] });
          renderer.resetCamera();
          renderWindow.render();
          //changeText("Chest");
      });
      }
      renderer.removeAllActors();
      renderer.removeAllVolumes();
      widgetManager.removeWidget(widget);
  }
  // -----------------------------------------------------------
    // UI control handling
    // -----------------------------------------------------------

  function updateFlag(e) {
    const value = !!e.target.checked;
    const name = e.currentTarget.dataset.name;
    widget.set({
      [name]: value
    }); // can be called on either viewWidget or parentWidget

    const elems = document.querySelectorAll('.flag');
    for (let i = 0; i < elems.length; i++) {
        elems[i].addEventListener('change', updateFlag);
    }
  
    const buttons = document.querySelectorAll('button');
    for (let i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', widgetRegistration);
    }
    widgetManager.enablePicking();
    renderWindow.render();
  }
  
    
    return (<div style={{zIndex: "2",position: "absolute" }}>
          <p className='iso'>Iso Value: </p>
          <input
          className='isoValue'
          type="range"
          />
          <table>
                        <tbody>
                            <tr>
                                <td>Pickable</td>
                                <td>
                                    <input className='flag' data-name="pickable" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>Visibility</td>
                                <td>
                                    <input className='flag' data-name="visibility" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>ContextVisibility</td>
                                <td>
                                    <input className='flag' data-name="contextVisibility" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>HandleVisibility</td>
                                <td>
                                    <input className='flag' data-name="handleVisibility" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>FaceHandlesEnabled</td>
                                <td>
                                    <input className='flag' data-name="faceHandlesEnabled" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>EdgeHandlesEnabled</td>
                                <td>
                                    <input className='flag' data-name="edgeHandlesEnabled" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                            <tr>
                                <td>CornerHandlesEnabled</td>
                                <td>
                                    <input className='flag' data-name="cornerHandlesEnabled" type="checkbox" onClick={updateFlag} defaultChecked='checked' />
                                </td>
                            </tr>
                        </tbody>
                    </table>
        <button name='button' className='btn ' onClick={iso}>{buttonText}</button>
    </div>);

    

  }
export default App;