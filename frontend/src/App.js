import {createBrowserRouter, RouterProvider} from 'react-router';

import Layout from "./Layout.jsx";
import Chat from "./Chat.jsx";

const router = createBrowserRouter([{
  element: <Layout />,
  children: [
    {
      path:'/',
      element:<Chat/>
    }
  ]
}]);

function App() {

  return(
      <>
        <RouterProvider router={router}/>
      </>
  );
}

export default App
