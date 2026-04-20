//import { registerRootComponent } from "expo";
//import App from "../App";

//registerRootComponent(App);

import { Redirect } from "expo-router";

export default function Index (){
    return <Redirect href={"/Login"}/>
}