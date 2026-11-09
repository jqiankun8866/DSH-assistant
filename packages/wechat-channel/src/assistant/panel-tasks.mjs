import {nativeTaskClient} from './native-tasks.mjs';
export function panelTaskCall(service,peer,action,data={}) {
 return service.tasks?service.tasks(peer,action,data):nativeTaskClient(service,peer,action,data);
}
