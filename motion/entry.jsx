import React from 'react';
import {registerRoot, Composition} from 'remotion';
import MotionComposition from '../src/motion/Composition.jsx';
import {exampleProject, durationOf, FORMATS} from './schema.mjs';
const project=exampleProject();
function Root(){return <Composition id="VelosMotion" component={MotionComposition} durationInFrames={durationOf(project)} width={1920} height={1080} fps={30} defaultProps={{project,urls:{}}} calculateMetadata={({props})=>({durationInFrames:durationOf(props.project),width:FORMATS[props.project.format][0],height:FORMATS[props.project.format][1],fps:30})}/>;}
registerRoot(Root);
