const path = require( 'path' );
const fs = require( 'fs' );
const childProcess = require( 'child_process' );

const express = require( 'express' );
const tmp = require( 'tmp' );
const git = require( 'nodegit' );
const bodyParser = require( 'body-parser' );

const app = express();

app.use( bodyParser.json() );
app.use( express.static( path.join( __dirname, 'web' ) ) );

const DEFAULT_PORT = 4455;

const REPO = {
    name: 'less-test',
    uri: 'https://github.com/kokarn/less-test.git',
};

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

let tmpDir;
let repoPath;

const CLONE_OPTIONS = {
    fetchOpts: {
        callbacks: {
            certificateCheck: () => {
                return 1;
            },
            credentials: function() {
                return git.Cred.userpassPlaintextNew( GITHUB_TOKEN, 'x-oauth-basic' );
            }
        }
    }
};

const getSignature = function getSignature(){
    return git.Signature.create( 'CommitBot','kokarn@gmail.com', Math.floor( new Date().getTime() / 1000 ), 0 );
}

const commitAndPush = function commitAndPush( username ){
    git.Repository.open( path.resolve( repoPath, '.git' ) )
        .then( ( repoResult ) => {
            repo = repoResult;
        } )
        .then( () => {
            return repo.refreshIndex();
        } )
        .then( ( indexResult ) => {
            index = indexResult;

            index.addByPath( '.lesshintrc' );
            index.addByPath( 'styles.less' );

            index.write();

            return index.writeTree();
        } )
        .then( ( oidResult ) => {
            oid = oidResult;
            return git.Reference.nameToId( repo, 'HEAD' );
        } )
        .then( ( head ) => {
            return repo.getCommit( head );
        } )
        .then( ( parent ) => {
            let signature = getSignature();
            return repo.createCommit( 'HEAD', signature, signature, `Lesshint test by ${ username }`, oid, [ parent ]);
        } )
        .then( ( commitId ) => {
            console.log( 'New Commit: ', commitId );
        } )

        /// PUSH
        .then( () => {
            return repo.getRemote( 'origin' );
        } )
        .then( ( remoteResult ) => {
            remote = remoteResult;
        } )
        .then( () => {
            return remote.push(
                [ 'refs/heads/master:refs/heads/master' ],
                CLONE_OPTIONS.fetchOpts
            );
        } )
        .then( () => {
            console.log( 'remote pushed!' );
        } )
        .catch( ( reason ) => {
            console.log( reason );
        } );
};

const updateFiles = function updateFiles( updateData ){
    console.log( repoPath );
    fs.writeFile( path.join( repoPath, '.lesshintrc' ), updateData.lesshint, ( error ) => {
        if( error ){
            throw error;
        }

        fs.writeFile( path.join( repoPath, 'styles.less' ), updateData.less, ( error ) => {
            if( error ){
                throw error;
            }

            console.log( 'Done with writes' );
            commitAndPush( updateData.username );
        } );
    } );
};

tmp.dir( ( error, tmpPath, cleanupCallback ) => {
    if ( error ) {
        throw error;
    }

    tmpDir = tmpPath;
    repoPath = path.join( tmpDir, REPO.name );
} );

app.post( '/build', function( request, response ){
    if ( fs.access( repoPath, fs.constants.F_OK, ( error ) => {
        let repositoryPromise;
        if ( error ) {
            console.log( `Couldn't find "${ REPO.name }" locally. Cloning from origin.` );
            repositoryPromise = git.Clone( REPO.uri, repoPath, CLONE_OPTIONS )
                .then( ( repo ) => {
                    console.log( `Repo cloned to ${ repoPath }.` );

                    updateFiles( {
                        lesshint: request.body.lesshint,
                        less: request.body.less,
                        username: request.body.username,
                    } );
                } );
        } else {
            var repo;

            console.log( `Found "${ REPO.name }" locally. Doing a fetch and a merge.` );

    		repositoryPromise = git.Repository.open( repoPath )
                .then( (repository) => {
        			repo = repository;
        			return repo.getRemote( 'origin' );
        		} )
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
                    console.log( `Repo fetched and merged into ${ repoPath }.` );

                    updateFiles( {
                        lesshint: request.body.lesshint,
                        less: request.body.less,
                        username: request.body.username,
                    } );
                } );
        }

        repositoryPromise.catch( ( gitError ) => {
            console.log( gitError );
            //console.log( gitError.stack );
            throw new Error( gitError );
        } );
    } ) );

    response.send( 'Ok' );
} );

app.listen( process.env.PORT || DEFAULT_PORT, () => {
    console.log( 'Service up and running on port', process.env.PORT || DEFAULT_PORT );
} );
