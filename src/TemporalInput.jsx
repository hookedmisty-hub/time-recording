export function withStartTime(draft, start) {
 const hour = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.exec(start)?.[1]
 if (hour === undefined || start === draft.start) return {...draft, start}
 const end = `${String(Number(hour) + 1).padStart(2, '0')}:00`
 return {...draft, start, end}
}

// The wrapper owns padding and borders. Native iOS date/time inputs have no
// padding, avoiding WebKit's intrinsic width/content-box sizing behavior.
export default function TemporalInput({className='',...props}){
 return <span className={`temporal-control${props.disabled?' is-disabled':''}${className?' '+className:''}`}>
  <input {...props}/>
 </span>
}
