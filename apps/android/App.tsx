import React, {useEffect, useRef, useState} from "react";
import {ActivityIndicator, BackHandler, Linking, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View} from "react-native";
import {WebView} from "react-native-webview";

const SITE = (process.env.EXPO_PUBLIC_TIKATERO_URL ?? "").replace(/\/$/, "");
const valid = /^https:\/\/[^/]+$/.test(SITE);
const tabs = [{label:"Explore",path:"/"},{label:"My tickets",path:"/me"},{label:"Host",path:"/console"}];

export default function App() {
  const ref = useRef<WebView<{}>>(null);
  const [back,setBack] = useState(false);
  const [path,setPath] = useState("/");
  const [error,setError] = useState(false);
  useEffect(() => {
    const sub=BackHandler.addEventListener("hardwareBackPress",()=>{
      if(back){ref.current?.goBack();return true;} return false;
    });
    return ()=>sub.remove();
  },[back]);
  if(!valid) return <SafeAreaView style={styles.center}><Text style={styles.brand}>Tikatero setup</Text><Text>Configure EXPO_PUBLIC_TIKATERO_URL as your HTTPS production site before building.</Text></SafeAreaView>;
  const go=(next:string)=>{setError(false); ref.current?.injectJavaScript(`window.location.assign(${JSON.stringify(SITE)} + ${JSON.stringify(next)});true;`);};
  return <SafeAreaView style={styles.root}>
    <StatusBar barStyle="dark-content"/>
    <View style={styles.header}><Text style={styles.brand}>TIKATERO</Text><TouchableOpacity onPress={()=>ref.current?.reload()} accessibilityLabel="Refresh"><Text style={styles.action}>Refresh</Text></TouchableOpacity></View>
    <View style={styles.body}>
      {error && <TouchableOpacity style={styles.error} onPress={()=>{setError(false);ref.current?.reload();}}><Text>Connection failed. Tap to retry.</Text></TouchableOpacity>}
      <WebView<{}> ref={ref} source={{uri:SITE}} javaScriptEnabled domStorageEnabled sharedCookiesEnabled thirdPartyCookiesEnabled
        originWhitelist={["https://*"]} setSupportMultipleWindows={false}
        startInLoadingState renderLoading={()=><View style={styles.center}><ActivityIndicator color="#F25C54"/></View>}
        onError={()=>setError(true)}
        onNavigationStateChange={s=>{setBack(s.canGoBack);if(s.url===SITE||s.url.startsWith(SITE+"/")){setPath(s.url.slice(SITE.length).split("?")[0]||"/");}}}
        onShouldStartLoadWithRequest={req=>{
          if(req.url===SITE||req.url.startsWith(SITE+"/")||req.url==="about:blank")return true;
          let host="";try{host=new URL(req.url).hostname;}catch{}
          if(["secure.payu.in","test.payu.in"].includes(host))return true;
          if(/^(https?:|tel:|mailto:)/.test(req.url))void Linking.openURL(req.url).catch(()=>{});
          return false;
        }}
      />
    </View>
    <View style={styles.nav}>{tabs.map(t=><TouchableOpacity key={t.path} onPress={()=>go(t.path)} accessibilityRole="tab" accessibilityState={{selected:path===t.path}} style={styles.tab}><Text style={[styles.navText,path===t.path&&styles.selected]}>{t.label}</Text></TouchableOpacity>)}</View>
  </SafeAreaView>;
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"white"},header:{padding:17,borderBottomWidth:1,borderColor:"#eee",flexDirection:"row",justifyContent:"space-between"},brand:{fontSize:20,fontWeight:"900",letterSpacing:2,color:"#2D3142"},action:{color:"#0E9F9A",fontWeight:"700"},body:{flex:1},center:{flex:1,justifyContent:"center",alignItems:"center",padding:26},error:{padding:12,backgroundColor:"#fff0f0"},nav:{flexDirection:"row",borderTopWidth:1,borderColor:"#eee"},tab:{flex:1,alignItems:"center",padding:16},navText:{color:"#666",fontWeight:"700"},selected:{color:"#F25C54"}
});
