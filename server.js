const path = require( 'path' );
const fs = require( 'fs' );
const childProcess = require( 'child_process' );

const express = require( 'express' );
const tmp = require( 'tmp' );

const app = express();

app.use( express.static( path.join( __dirname, 'web' ) ) );

const DEFAULT_PORT = 4455;

const REPO = {
    name: 'less-test',
    uri: 'git@github.com:kokarn/less-test.git',
};

app.get( '/build', function( req, res ){
    tmp.dir(function _tempDirCreated(err, path, cleanupCallback) {
        if (err) {
            throw err;
        }

        console.log("Dir: ", path);

        // Manual cleanup 
        cleanupCallback();
    });
    if ( fs.access( this.clonePath, fs.constants.F_OK, ( error ) => {
        let repositoryPromise;
        if ( error ) {
            console.log( `Couldn't find "${ REPO.name }" locally. Cloning from origin.` );
            repositoryPromise = git.Clone( REPO.uri, this.clonePath, CLONE_OPTIONS )
                .then( ( repo ) => {
                    console.log( `Repo cloned to ${ this.clonePath }.` );
                    this.packageElectron();
                } );
        } else {
            var repo;

            console.log( `Found "${ REPO.name }" locally. Doing a fetch and a merge.` );

    		repositoryPromise = git.Repository.open( this.clonePath )
                .then( (repository) => {
        			repo = repository;
        			return repo.getRemote( 'origin' );
        		})
                .then( ( remote ) => {
        			// Sync :/
        			if ( remote.url() === REPO.uri ) {
        				return repo;
        			} else {
        				throw new Error( 'On-disk repository\'s origin remote does not have the specified URL set' );
        			}
        		} )
                .then( () => {
        			return repo.fetchAll( CLONE_OPTIONS.fetchOpts );
        		} )
                .then( () => {
        			return repo.mergeBranches( 'master', 'origin/master' );
        		} )
                .then( () => {
                    console.log( `Repo fetched and merged into ${ this.clonePath }.` );
                    this.packageElectron();
                } );
        }

        repositoryPromise.catch( ( gitError ) => {
            console.log( gitError );
            //console.log( gitError.stack );
            throw new Error( gitError );
        } );
    } ) );
});

app.listen( process.env.PORT || DEFAULT_PORT, () => {
    console.log( 'Service up and running on port', process.env.PORT || DEFAULT_PORT );
} );
