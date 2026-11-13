// The wrapper owns padding and borders. Native iOS date/time inputs have no
// padding, avoiding WebKit's intrinsic width/content-box sizing behavior.
export default function TemporalInput({className='',...props}){
 return <span className={`temporal-control${props.disabled?' is-disabled':''}${className?' '+className:''}`}>
  <input {...props}/>
 </span>
}
