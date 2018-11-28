import * as actions from './actions';
import reducer from './reducers';
import * as selectors from './selectors';

export interface State {
    selected: string[];
}

export default {
    actions,
    reducer,
    selectors,
};
